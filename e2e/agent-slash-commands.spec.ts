import "./env";

import { expect, test, type Page, type Route } from "@playwright/test";
import pg from "pg";
import { createTestApi } from "./helpers";

// Source C (runtime local-skill enumeration) is fully fixture-driven: both
// legs of the two-phase protocol are intercepted with terminal payloads, so
// no request ever reaches a real daemon or the host's ~/.claude / $CODEX_HOME.
const PLUGIN_SKILL_KEY = "oh-my-claudecode:deep-interview";
const PLAIN_SKILL_KEY = "deploy-check";
const MOUNTED_SKILL_NAME = "Deploy Check";

function fixtureRuntimeSkillsPayload(runtimeId: string) {
  const now = new Date().toISOString();
  return {
    id: "e2e-local-skills-request",
    runtime_id: runtimeId,
    status: "completed",
    supported: true,
    skills: [
      {
        key: PLUGIN_SKILL_KEY,
        name: "Deep Interview",
        description: "Socratic deep interview command",
        source_path: "/e2e/fixtures/plugins/oh-my-claudecode/commands/deep-interview.md",
        provider: "claude",
        root: "plugin",
        plugin: "oh-my-claudecode",
        can_disable: true,
        file_count: 1,
      },
      {
        key: PLAIN_SKILL_KEY,
        name: "Deploy Check",
        description: "Verify the latest deploy",
        source_path: "/e2e/fixtures/skills/deploy-check/SKILL.md",
        provider: "claude",
        root: "provider",
        file_count: 1,
      },
    ],
    mcp_servers: [] as unknown[],
    mcp_supported: false,
    created_at: now,
    updated_at: now,
  };
}

function fulfillJson(route: Route, payload: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

// Terminal completed payload on the initiate POST and the same shape on the
// GET poll leg, so the client's pending/running loop (local-skills.ts) exits
// on the first response and the test never polls a real backend.
function mockRuntimeSkillsSuccess(page: Page, runtimeId: string) {
  void page.route(`**/api/runtimes/${runtimeId}/local-skills`, (route) =>
    fulfillJson(route, fixtureRuntimeSkillsPayload(runtimeId)),
  );
  void page.route(`**/api/runtimes/${runtimeId}/local-skills/*`, (route) =>
    fulfillJson(route, fixtureRuntimeSkillsPayload(runtimeId)),
  );
}

// Failure mode for the degraded path: both legs abort at the network layer,
// the query lands in error state (retry: false), and the menu shows the
// mounted-only group with the unavailable notice.
function mockRuntimeSkillsFailure(page: Page, runtimeId: string) {
  void page.route(`**/api/runtimes/${runtimeId}/local-skills`, (route) =>
    route.abort(),
  );
  void page.route(`**/api/runtimes/${runtimeId}/local-skills/*`, (route) =>
    route.abort(),
  );
}

/** Types an @agent mention through the real mention picker. */
async function mentionAgent(page: Page, agentName: string) {
  // Readonly-first composer: clicking the shell is what mounts the editor.
  await page.getByTestId("comment-composer-shell").click();
  // The placeholder scopes to the ISSUE comment editor — the floating chat
  // window stays mounted (visually hidden) with its own ProseMirror, so an
  // unscoped .ProseMirror can resolve to the chat composer. The placeholder
  // selector only matches while the doc is empty, which is exactly the state
  // we interact in; post-insert state is asserted through the trigger chip.
  const editor = page
    .locator('.ProseMirror:has([data-placeholder="Leave a comment..."])')
    .first();
  await editor.click();
  await page.keyboard.type(`@S7`);
  const option = page.getByText(agentName).first();
  await expect(option).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Enter");
  // The trigger preview chip is rendered by the issue composer only once the
  // inserted mention parses back to this agent — proof the mention landed in
  // the comment composer rather than the hidden chat composer.
  await expect(
    page.getByRole("button", { name: `${agentName} trigger:` }),
  ).toBeVisible({ timeout: 15_000 });
}

test("agent slash menu groups runtime + mounted commands, inserts plain text, and the posted comment triggers the mentioned agent", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const api = await createTestApi();
  const db = new pg.Client(process.env.DATABASE_URL);
  await db.connect();
  let runtimeId: string | undefined;
  let agentId: string | undefined;
  let skillId: string | undefined;
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const agentName = `S7 Slash Fixture ${unique}`;
  try {
    const workspace = (await api.getWorkspaces())[0]!;
    const user = await db.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [
      api.getEmail(),
    ]);
    const userId = user.rows[0]!.id;

    // Mirror comment-agent-routing.spec.ts: a cloud runtime plus a private,
    // owner-matching agent so the viewer may invoke it (canAssignAgentToIssue).
    const runtime = await db.query<{ id: string }>(
      `INSERT INTO agent_runtime (workspace_id, name, runtime_mode, provider, status, device_info, metadata, owner_id, last_seen_at)
       VALUES ($1, 'S7 slash commands verification', 'cloud', 'e2e_agent_slash_commands', 'online', 'E2E fixture', '{}'::jsonb, $2, now()) RETURNING id`,
      [workspace.id, userId],
    );
    runtimeId = runtime.rows[0]!.id;
    const agent = await db.query<{ id: string }>(
      `INSERT INTO agent (workspace_id, name, description, instructions, runtime_mode, runtime_config, runtime_id, visibility, permission_mode, max_concurrent_tasks, owner_id)
       VALUES ($1, $2, '', '', 'cloud', '{}'::jsonb, $3, 'private', 'private', 1, $4) RETURNING id`,
      [workspace.id, agentName, runtimeId, userId],
    );
    agentId = agent.rows[0]!.id;
    // Source A: one mounted skill on the agent.
    const skill = await db.query<{ id: string }>(
      `INSERT INTO skill (workspace_id, name, description, content) VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        workspace.id,
        `${MOUNTED_SKILL_NAME} ${unique}`,
        "E2E mounted skill for the agent slash picker",
        "Useless body — only the name surfaces in the menu.",
      ],
    );
    skillId = skill.rows[0]!.id;
    await db.query(`INSERT INTO agent_skill (agent_id, skill_id) VALUES ($1, $2)`, [
      agentId,
      skillId,
    ]);

    const issue = await api.createIssue("Agent slash command picker verification");
    mockRuntimeSkillsSuccess(page, runtimeId);

    await page.addInitScript((token) => {
      localStorage.setItem("multica_token", token!);
      localStorage.setItem("multica:chat:isOpen", "false");
    }, api.getToken());
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(`/${workspace.slug}/issues/${issue.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("comment-composer-shell")).toBeVisible({ timeout: 45_000 });
    await mentionAgent(page, agentName);

    // The trigger preview names the agent Send will route to.
    await expect(
      page.getByRole("button", { name: `${agentName} trigger:` }),
    ).toBeVisible({ timeout: 15_000 });

    // Slash menu: built-in /note first, then the agent group with both
    // fixture entries under a per-agent header. Anchored name regexes keep
    // the runtime `deploy-check` apart from the mounted `deploy-check-<run>`
    // slug (substring matching would hit both).
    await page.keyboard.type("/");
    const menu = page.locator("div.bg-popover.w-72").first();
    await expect(menu.getByRole("button", { name: "/note" })).toBeVisible({ timeout: 15_000 });
    await expect(menu.getByText(agentName)).toBeVisible();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLUGIN_SKILL_KEY}`) }),
    ).toBeVisible();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLAIN_SKILL_KEY} `) }),
    ).toBeVisible();

    // Filter keeps only the plugin-prefixed entry; the header survives with it.
    await page.keyboard.type("deep");
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLUGIN_SKILL_KEY}`) }),
    ).toBeVisible();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLAIN_SKILL_KEY} `) }),
    ).toHaveCount(0);
    await expect(menu.getByText(agentName)).toBeVisible();

    await page.keyboard.press("Enter");
    // Menu closed; the composer now holds the plain-text command. The chat
    // composer is empty, so this is unambiguous at page level.
    await expect(page.getByText(`/${PLUGIN_SKILL_KEY}`)).toBeVisible();
    await expect(
      page.locator("div.bg-popover.w-72"),
    ).toHaveCount(0);

    const posted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/api/issues/${issue.id}/comments`),
    );
    await page.keyboard.press("ControlOrMeta+Enter");
    const response = await posted;
    expect(response.status()).toBe(201);
    const comment = await response.json();
    // Byte-identical to hand-typing: the inserted text is `/key ` with the
    // caret at the parameter position; the markdown serializer then canonical
    // form trims the trailing space (a hand-typed `/key ` serializes the same).
    // The plugin: prefix survives verbatim.
    expect(comment.content).toBe(
      `[@${agentName}](mention://agent/${agentId}) /${PLUGIN_SKILL_KEY}`,
    );

    // The trigger outcome: one queued run for the mentioned agent.
    const tasks = await db.query<{ id: string; agent_id: string; status: string }>(
      `SELECT id, agent_id, status FROM agent_task_queue WHERE trigger_comment_id = $1`,
      [comment.id],
    );
    expect(tasks.rows).toHaveLength(1);
    expect(tasks.rows[0]).toMatchObject({ agent_id: agentId, status: "queued" });
    await expect(page.locator(`[data-run-id="${tasks.rows[0]!.id}"]`)).toBeVisible({
      timeout: 30_000,
    });

    // Read-only thread rendering: the command stays literal text, never a
    // link or mention chip. The text legitimately appears in the thread body
    // plus sidebar/minimap previews — assert visibility unstrictly and let the
    // anchor check carry the "not linkified" claim.
    await expect(page.getByText(`/${PLUGIN_SKILL_KEY}`).first()).toBeVisible({ timeout: 30_000 });
    expect(
      await page.locator("a").filter({ hasText: `/${PLUGIN_SKILL_KEY}` }).count(),
    ).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("agent-slash-posted.png"), fullPage: true });
  } finally {
    await api.cleanup();
    if (skillId) await db.query(`DELETE FROM skill WHERE id = $1`, [skillId]);
    if (agentId) await db.query(`DELETE FROM agent WHERE id = $1`, [agentId]);
    if (runtimeId) await db.query(`DELETE FROM agent_runtime WHERE id = $1`, [runtimeId]);
    await db.end();
  }
});

test("degraded runtime enumeration keeps the mounted-only group with an unavailable notice", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const api = await createTestApi();
  const db = new pg.Client(process.env.DATABASE_URL);
  await db.connect();
  let runtimeId: string | undefined;
  let agentId: string | undefined;
  let skillId: string | undefined;
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const agentName = `S7 Slash Fixture ${unique}`;
  try {
    const workspace = (await api.getWorkspaces())[0]!;
    const user = await db.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [
      api.getEmail(),
    ]);
    const userId = user.rows[0]!.id;

    const runtime = await db.query<{ id: string }>(
      `INSERT INTO agent_runtime (workspace_id, name, runtime_mode, provider, status, device_info, metadata, owner_id, last_seen_at)
       VALUES ($1, 'S7 slash commands degraded verification', 'cloud', 'e2e_agent_slash_commands', 'online', 'E2E fixture', '{}'::jsonb, $2, now()) RETURNING id`,
      [workspace.id, userId],
    );
    runtimeId = runtime.rows[0]!.id;
    const agent = await db.query<{ id: string }>(
      `INSERT INTO agent (workspace_id, name, description, instructions, runtime_mode, runtime_config, runtime_id, visibility, permission_mode, max_concurrent_tasks, owner_id)
       VALUES ($1, $2, '', '', 'cloud', '{}'::jsonb, $3, 'private', 'private', 1, $4) RETURNING id`,
      [workspace.id, agentName, runtimeId, userId],
    );
    agentId = agent.rows[0]!.id;
    const skill = await db.query<{ id: string }>(
      `INSERT INTO skill (workspace_id, name, description, content) VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        workspace.id,
        `${MOUNTED_SKILL_NAME} ${unique}`,
        "E2E mounted skill for the degraded agent slash path",
        "Useless body — only the name surfaces in the menu.",
      ],
    );
    skillId = skill.rows[0]!.id;
    await db.query(`INSERT INTO agent_skill (agent_id, skill_id) VALUES ($1, $2)`, [
      agentId,
      skillId,
    ]);

    const issue = await api.createIssue("Agent slash command degraded verification");
    // Registered before navigation so the composer-mount prewarm fails.
    mockRuntimeSkillsFailure(page, runtimeId);

    await page.addInitScript((token) => {
      localStorage.setItem("multica_token", token!);
      localStorage.setItem("multica:chat:isOpen", "false");
    }, api.getToken());
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(`/${workspace.slug}/issues/${issue.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("comment-composer-shell")).toBeVisible({ timeout: 45_000 });
    await mentionAgent(page, agentName);

    await page.keyboard.type("/");
    const menu = page.locator("div.bg-popover.w-72").first();
    await expect(menu.getByRole("button", { name: "/note" })).toBeVisible({ timeout: 15_000 });
    await expect(menu.getByText(agentName)).toBeVisible();
    // Source A survives; source C (including the plugin-prefixed key) is gone.
    // The mounted skill slug is `deploy-check-${unique}` (space folded to
    // hyphen), matching the daemon's sanitize pipeline.
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/deploy-check-${unique} `) }),
    ).toBeVisible();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLUGIN_SKILL_KEY}`) }),
    ).toHaveCount(0);
    // Degraded notice plus the header retry control.
    await expect(menu.getByText("Runtime skills unavailable")).toBeVisible({ timeout: 15_000 });
    await expect(menu.getByRole("button", { name: "Retry" })).toBeVisible();
  } finally {
    await api.cleanup();
    if (skillId) await db.query(`DELETE FROM skill WHERE id = $1`, [skillId]);
    if (agentId) await db.query(`DELETE FROM agent WHERE id = $1`, [agentId]);
    if (runtimeId) await db.query(`DELETE FROM agent_runtime WHERE id = $1`, [runtimeId]);
    await db.end();
  }
});

test("chat slash menu lists the selected agent's catalog, inserts plain text, and the posted message carries the command", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const api = await createTestApi();
  const db = new pg.Client(process.env.DATABASE_URL);
  await db.connect();
  let runtimeId: string | undefined;
  let agentId: string | undefined;
  let skillId: string | undefined;
  let sessionId: string | undefined;
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const agentName = `S8 Chat Slash Fixture ${unique}`;
  try {
    const workspace = (await api.getWorkspaces())[0]!;
    const user = await db.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [
      api.getEmail(),
    ]);
    const userId = user.rows[0]!.id;

    // Same fixture shape as the comment test: a cloud runtime plus an agent
    // bound to it (workspace-visible, owner-matching so the viewer may run it).
    const runtime = await db.query<{ id: string }>(
      `INSERT INTO agent_runtime (workspace_id, name, runtime_mode, provider, status, device_info, metadata, owner_id, last_seen_at)
       VALUES ($1, 'S8 chat slash verification', 'cloud', 'e2e_agent_slash_commands', 'online', 'E2E fixture', '{}'::jsonb, $2, now()) RETURNING id`,
      [workspace.id, userId],
    );
    runtimeId = runtime.rows[0]!.id;
    const agent = await db.query<{ id: string }>(
      `INSERT INTO agent (workspace_id, name, description, instructions, runtime_mode, runtime_config, runtime_id, visibility, max_concurrent_tasks, owner_id)
       VALUES ($1, $2, '', '', 'cloud', '{}'::jsonb, $3, 'workspace', 1, $4) RETURNING id`,
      [workspace.id, agentName, runtimeId, userId],
    );
    agentId = agent.rows[0]!.id;
    // Source A: one mounted skill (slug folds the space to a hyphen).
    const skill = await db.query<{ id: string }>(
      `INSERT INTO skill (workspace_id, name, description, content) VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        workspace.id,
        `Deploy Check ${unique}`,
        "E2E mounted skill for the chat slash picker",
        "Useless body — only the name surfaces in the menu.",
      ],
    );
    skillId = skill.rows[0]!.id;
    await db.query(`INSERT INTO agent_skill (agent_id, skill_id) VALUES ($1, $2)`, [
      agentId,
      skillId,
    ]);

    // Registered before navigation: the composer's mount prewarm enumerates
    // the runtime's local skills (source C) behind the menu.
    mockRuntimeSkillsSuccess(page, runtimeId);

    await page.addInitScript(
      ({ token }) => {
        localStorage.setItem("multica_token", token);
        // Keep the floating chat window out of the DOM so the page composer is
        // the only ProseMirror, and deep-link `?agent=` below to bind the
        // fresh compose to the fixture agent.
        localStorage.setItem("multica:chat:isOpen", "false");
        localStorage.setItem("multica:chat:floatingChatEnabled", "false");
      },
      { token: api.getToken() },
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(`/${workspace.slug}/chat?agent=${agentId}`, { waitUntil: "domcontentloaded" });

    // The chat composer (placeholder names the selected agent) is the only
    // ProseMirror on this page with the floating window disabled.
    await expect(
      page.locator('.ProseMirror:has([data-placeholder^="Message"])'),
    ).toBeVisible({ timeout: 45_000 });
    const composer = page.locator(".ProseMirror").first();
    await composer.click();

    // Menu: the agent header over both sources — plugin-prefixed runtime key
    // and the mounted skill slug.
    await page.keyboard.type("/");
    const menu = page.locator("div.bg-popover.w-72").first();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLUGIN_SKILL_KEY}`) }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(menu.getByText(agentName)).toBeVisible();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/deploy-check-${unique}`) }),
    ).toBeVisible();

    // Filter keeps only the plugin entry; the header survives with it.
    await page.keyboard.type("deep");
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/${PLUGIN_SKILL_KEY}`) }),
    ).toBeVisible();
    await expect(
      menu.getByRole("button", { name: new RegExp(`^/deploy-check-${unique}`) }),
    ).toHaveCount(0);
    await expect(menu.getByText(agentName)).toBeVisible();

    await page.keyboard.press("Enter");
    // Menu closed; the composer holds the plain-text command with the caret
    // at the parameter position (nothing else was typed).
    await expect(page.locator("div.bg-popover.w-72")).toHaveCount(0);
    await expect(composer).toContainText(`/${PLUGIN_SKILL_KEY}`);

    const posted = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/api/chat/sessions/") &&
        response.url().endsWith("/messages"),
    );
    await page.keyboard.press("ControlOrMeta+Enter");
    const response = await posted;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { message_id: string };
    expect(body.message_id).toBeTruthy();

    // Byte-level proof: the stored message carries the plain command text —
    // exactly what a hand-typed command would produce. The session the send
    // lazily created is resolved via the fixture agent for the content check.
    const session = await db.query<{ id: string }>(
      `SELECT id FROM chat_session WHERE agent_id = $1`,
      [agentId],
    );
    sessionId = session.rows[0]!.id;
    const message = await db.query<{ content: string }>(
      `SELECT content FROM chat_message WHERE chat_session_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [sessionId],
    );
    expect(message.rows[0]?.content).toContain(`/${PLUGIN_SKILL_KEY}`);
  } finally {
    await api.cleanup();
    // chat_session rows are matched by agent — the send lazily created one.
    await db.query(`DELETE FROM chat_session WHERE agent_id = $1`, [agentId ?? ""]);
    if (skillId) await db.query(`DELETE FROM skill WHERE id = $1`, [skillId]);
    if (agentId) await db.query(`DELETE FROM agent WHERE id = $1`, [agentId]);
    if (runtimeId) await db.query(`DELETE FROM agent_runtime WHERE id = $1`, [runtimeId]);
    await db.end();
  }
});
