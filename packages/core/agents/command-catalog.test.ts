// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  Agent,
  AgentSkillSummary,
  RuntimeLocalSkillSummary,
} from "../types";
import {
  buildAgentCommandCatalog,
  resolveMountedSkillSlugs,
  sanitizeSkillSlug,
  type AgentCommandGroup,
} from "./command-catalog";

// Reads the first group of a catalog result, failing loudly when a test that
// expects exactly one group built none.
function firstGroup(groups: AgentCommandGroup[]): AgentCommandGroup {
  const group = groups[0];
  if (group === undefined) {
    throw new Error("expected at least one group");
  }
  return group;
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    workspace_id: "ws-1",
    runtime_id: "runtime-1",
    name: "Atlas",
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_args: [],
    visibility: "workspace",
    permission_mode: "private",
    invocation_targets: [],
    status: "idle",
    max_concurrent_tasks: 1,
    model: "",
    owner_id: null,
    skills: [],
    created_at: "",
    updated_at: "",
    archived_at: null,
    archived_by: null,
    ...overrides,
  };
}

function makeMountedSkill(
  overrides: Partial<AgentSkillSummary> = {},
): AgentSkillSummary {
  return {
    id: "skill-1",
    name: "PR review",
    description: "Reviews pull requests",
    ...overrides,
  };
}

function makeRuntimeSkill(
  overrides: Partial<RuntimeLocalSkillSummary> = {},
): RuntimeLocalSkillSummary {
  return {
    key: "review-pr",
    name: "Review PR",
    source_path: "/skills/review-pr/SKILL.md",
    provider: "claude",
    file_count: 1,
    ...overrides,
  };
}

describe("sanitizeSkillSlug", () => {
  it("folds display names into slugs", () => {
    expect(sanitizeSkillSlug("PR review")).toBe("pr-review");
    expect(sanitizeSkillSlug("Deploy — Prod")).toBe("deploy-prod");
    expect(sanitizeSkillSlug("  Mixed  Case  ")).toBe("mixed-case");
  });

  it("collapses non-alphanumeric runs into one hyphen and trims them", () => {
    expect(sanitizeSkillSlug("--a--  b--")).toBe("a-b");
    expect(sanitizeSkillSlug("!!!skill!!!")).toBe("skill");
  });

  it("folds non-ASCII characters into hyphens", () => {
    expect(sanitizeSkillSlug("Über-Test")).toBe("ber-test");
    expect(sanitizeSkillSlug("代码审查")).toBe("skill");
    expect(sanitizeSkillSlug("代码 review")).toBe("review");
  });

  it("falls back to skill when nothing survives", () => {
    expect(sanitizeSkillSlug("")).toBe("skill");
    expect(sanitizeSkillSlug("!!!")).toBe("skill");
    expect(sanitizeSkillSlug("　")).toBe("skill");
  });

  it("is idempotent on already-slug input", () => {
    expect(sanitizeSkillSlug("pr-review")).toBe("pr-review");
  });
});

describe("resolveMountedSkillSlugs", () => {
  it("returns sanitized slugs in input order", () => {
    expect(resolveMountedSkillSlugs(["Deploy", "PR review"])).toEqual([
      "deploy",
      "pr-review",
    ]);
  });

  it("appends -multica to the first in-batch collision", () => {
    // Anchor: execenv resolveSkillSlugs doc example — "A B" and "A-B" both
    // reduce to "a-b"; the second claims `a-b-multica`.
    expect(resolveMountedSkillSlugs(["A B", "A-B"])).toEqual([
      "a-b",
      "a-b-multica",
    ]);
  });

  it("continues the daemon's numbered candidate sequence", () => {
    // Anchor: skillSlugCandidate sequence — bare, `-multica`, `-multica-<n>`.
    expect(resolveMountedSkillSlugs(["A B", "A-B", "a b"])).toEqual([
      "a-b",
      "a-b-multica",
      "a-b-multica-2",
    ]);
  });

  it("is deterministic for identical input", () => {
    const names = ["A B", "A-B", "Deploy"];
    expect(resolveMountedSkillSlugs(names)).toEqual(
      resolveMountedSkillSlugs(names),
    );
  });
});

describe("buildAgentCommandCatalog", () => {
  it("returns no groups for no agents", () => {
    expect(
      buildAgentCommandCatalog({
        agents: [],
        runtimeSkillsByRuntime: new Map(),
      }),
    ).toEqual([]);
  });

  it("lists enabled mounted skills with sanitized labels", () => {
    const group = buildAgentCommandCatalog({
      agents: [
        makeAgent({
          skills: [
            makeMountedSkill({
              id: "skill-1",
              name: "PR review",
              description: "Reviews pull requests",
            }),
            makeMountedSkill({
              id: "skill-2",
              name: "Old skill",
              enabled: false,
            }),
          ],
        }),
      ],
      runtimeSkillsByRuntime: new Map(),
    });

    expect(group).toHaveLength(1);
    expect(firstGroup(group).degraded).toBe(true);
    expect(firstGroup(group).items).toEqual([
      {
        id: "skill-1",
        label: "pr-review",
        description: "Reviews pull requests",
        source: "mounted",
      },
    ]);
  });

  it("resolves mounted label collisions within the batch", () => {
    const group = buildAgentCommandCatalog({
      agents: [
        makeAgent({
          skills: [
            makeMountedSkill({ id: "skill-1", name: "A B" }),
            makeMountedSkill({ id: "skill-2", name: "A-B" }),
          ],
        }),
      ],
      runtimeSkillsByRuntime: new Map(),
    });

    expect(
      firstGroup(group).items.map((item) => [item.label, item.source]),
    ).toEqual([
      ["a-b", "mounted"],
      ["a-b-multica", "mounted"],
    ]);
  });

  it("lists runtime skills verbatim, including plugin-prefixed keys", () => {
    const group = buildAgentCommandCatalog({
      agents: [makeAgent()],
      runtimeSkillsByRuntime: new Map([
        [
          "runtime-1",
          [
            makeRuntimeSkill({ key: "review-pr", name: "Review PR" }),
            makeRuntimeSkill({
              key: "oh-my-claudecode:deep-interview",
              name: "Deep Interview",
              plugin: "oh-my-claudecode",
            }),
          ],
        ],
      ]),
    });

    expect(firstGroup(group).degraded).toBe(false);
    expect(firstGroup(group).items).toEqual([
      {
        id: "review-pr",
        label: "review-pr",
        description: undefined,
        source: "runtime",
        plugin: undefined,
      },
      {
        id: "oh-my-claudecode:deep-interview",
        label: "oh-my-claudecode:deep-interview",
        description: undefined,
        source: "runtime",
        plugin: "oh-my-claudecode",
      },
    ]);
  });

  it("prefers the runtime entry when a mounted skill normalizes to the same label", () => {
    const group = buildAgentCommandCatalog({
      agents: [
        makeAgent({
          skills: [
            makeMountedSkill({ id: "skill-1", name: "Review PR" }),
          ],
        }),
      ],
      runtimeSkillsByRuntime: new Map([
        [
          "runtime-1",
          [makeRuntimeSkill({ key: "review-pr" })],
        ],
      ]),
    });

    expect(
      firstGroup(group).items.map((item) => [item.label, item.source]),
    ).toEqual([["review-pr", "runtime"]]);
  });

  it("excludes runtime skills disabled for this agent", () => {
    const group = buildAgentCommandCatalog({
      agents: [
        makeAgent({
          disabled_runtime_skills: [
            {
              runtime_id: "runtime-1",
              provider: "claude",
              root: "provider",
              key: "deploy",
            },
            {
              runtime_id: "runtime-2",
              provider: "claude",
              root: "provider",
              key: "review-pr",
            },
          ],
        }),
      ],
      runtimeSkillsByRuntime: new Map([
        [
          "runtime-1",
          [
            makeRuntimeSkill({ key: "review-pr" }),
            makeRuntimeSkill({ key: "deploy" }),
          ],
        ],
      ]),
    });

    expect(
      firstGroup(group).items.map((item) => item.label),
    ).toEqual(["review-pr"]);
  });

  it("drops note entries from both sources case-insensitively", () => {
    const group = buildAgentCommandCatalog({
      agents: [
        makeAgent({
          skills: [
            makeMountedSkill({ id: "skill-1", name: "NOTE" }),
            makeMountedSkill({ id: "skill-2", name: "Notes" }),
          ],
        }),
      ],
      runtimeSkillsByRuntime: new Map([
        [
          "runtime-1",
          [
            makeRuntimeSkill({ key: "note" }),
            makeRuntimeSkill({ key: "Note " }),
            makeRuntimeSkill({
              key: "plugin:note",
              plugin: "plugin",
            }),
          ],
        ],
      ]),
    });

    expect(
      firstGroup(group).items.map((item) => [item.label, item.source]),
    ).toEqual([
      ["notes", "mounted"],
      ["plugin:note", "runtime"],
    ]);
  });

  it("keeps mounted items and flags degraded when the runtime cache lacks the runtime", () => {
    const group = buildAgentCommandCatalog({
      agents: [
        makeAgent({
          skills: [makeMountedSkill({ id: "skill-1", name: "PR review" })],
        }),
      ],
      runtimeSkillsByRuntime: new Map(),
    });

    expect(firstGroup(group).degraded).toBe(true);
    expect(
      firstGroup(group).items.map((item) => item.source),
    ).toEqual(["mounted"]);
  });

  it("does not flag degraded when the runtime enumeration is present but empty", () => {
    const group = buildAgentCommandCatalog({
      agents: [makeAgent()],
      runtimeSkillsByRuntime: new Map([["runtime-1", []]]),
    });

    expect(firstGroup(group).degraded).toBe(false);
    expect(firstGroup(group).items).toEqual([]);
  });
});
