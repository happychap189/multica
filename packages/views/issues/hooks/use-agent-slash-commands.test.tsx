/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { setApiInstance } from "@multica/core/api";
import type { ApiClient } from "@multica/core/api/client";
import { createAuthStore, registerAuthStore, useAuthStore } from "@multica/core/auth";
import { WorkspaceSlugProvider } from "@multica/core/paths";
import type { AgentCommandGroup } from "@multica/core/agents";
import { runtimeLocalSkillsKeys } from "@multica/core/runtimes";
import { workspaceKeys } from "@multica/core/workspace/queries";
import type {
  Agent,
  MemberWithUser,
  RuntimeLocalSkillSummary,
  User,
  Workspace,
} from "@multica/core/types";

import { useAgentSlashCommands } from "./use-agent-slash-commands";

const WS = "ws-1";
const VIEWER_ID = "user-1";
const SLUG = "acme";

const WS_FIXTURE = {
  id: WS,
  slug: SLUG,
  name: "Acme",
} as unknown as Workspace;

const VIEWER = { id: VIEWER_ID } as unknown as User;

// The auth singleton must be registered before useAuthStore works; a bare
// store (no api/storage behavior needed here) is enough to hold `user`.
registerAuthStore(
  createAuthStore({
    api: {} as ApiClient,
    storage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  }),
);

/** Counted ApiClient mock handle. */
type ApiHarness = {
  calls: () => string[];
  setFailing: (runtimeId: string, failing: boolean) => void;
};

/**
 * Installs a counted ApiClient mock. Each runtime returns one completed
 * enumeration (status "completed", so resolveRuntimeLocalSkills never enters
 * its poll loop) unless listed in `failing` (rejects) or `blocked` (never
 * settles).
 */
function installApi(options?: {
  failing?: string[];
  blocked?: string[];
}): ApiHarness {
  const calls: string[] = [];
  const failing = new Set(options?.failing ?? []);
  const blocked = new Set(options?.blocked ?? []);

  const initiateListLocalSkills = vi.fn(async (runtimeId: string) => {
    calls.push(runtimeId);
    if (blocked.has(runtimeId)) return new Promise<never>(() => {});
    if (failing.has(runtimeId)) throw new Error("runtime offline");
    return {
      id: `req-${runtimeId}`,
      runtime_id: runtimeId,
      status: "completed",
      skills: [
        {
          key: `${runtimeId}-cmd`,
          name: `${runtimeId}-cmd`,
          description: `Command for ${runtimeId}`,
          source_path: `/skills/${runtimeId}-cmd`,
          provider: "claude",
          file_count: 1,
        },
      ],
      supported: true,
    };
  });

  setApiInstance({
    listWorkspaces: async () => [WS_FIXTURE],
    initiateListLocalSkills,
  } as unknown as ApiClient);

  return {
    calls: () => calls,
    setFailing: (runtimeId, isFailing) => {
      if (isFailing) failing.add(runtimeId);
      else failing.delete(runtimeId);
    },
  };
}

function makeAgent(overrides: Partial<Agent> & { id: string }): Agent {
  return {
    workspace_id: WS,
    runtime_id: "",
    runtime_bound: true,
    name: overrides.id,
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_args: [],
    visibility: "workspace",
    permission_mode: "private",
    // The viewer owns every default fixture, so canAssignAgentToIssue allows
    // them; non-assignable cases override owner_id.
    owner_id: VIEWER_ID,
    invocation_targets: [{ target_type: "workspace", target_id: null }],
    status: "idle",
    max_concurrent_tasks: 1,
    model: "claude",
    skills: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    archived_by: null,
    ...overrides,
  };
}

const MEMBER = {
  id: "member-1",
  workspace_id: WS,
  user_id: VIEWER_ID,
  role: "owner",
  created_at: "2026-01-01T00:00:00Z",
  name: "Viewer",
  email: "viewer@example.com",
  avatar_url: null,
} as unknown as MemberWithUser;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <WorkspaceSlugProvider slug={SLUG}>{children}</WorkspaceSlugProvider>
      </QueryClientProvider>
    );
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

/** Renders the hook against a shared cache. */
function renderAgentSlashCommands(queryClient: QueryClient) {
  return renderHook(() => useAgentSlashCommands(), {
    wrapper: wrapperFor(queryClient),
  });
}

function seedCache(queryClient: QueryClient, agents: Agent[]) {
  queryClient.setQueryData(workspaceKeys.list(), [WS_FIXTURE]);
  queryClient.setQueryData(workspaceKeys.agents(WS), agents);
  queryClient.setQueryData(workspaceKeys.members(WS), [MEMBER]);
}

function seedRuntimeSkills(
  queryClient: QueryClient,
  runtimeId: string,
  skills: RuntimeLocalSkillSummary[],
) {
  queryClient.setQueryData(runtimeLocalSkillsKeys.forRuntime(runtimeId), {
    skills,
    supported: true,
  });
}

/**
 * Reads the first group of a getter result, failing loudly when a test that
 * expects exactly one group built none (mirrors the core catalog test).
 */
function firstGroup(groups: AgentCommandGroup[]): AgentCommandGroup {
  const group = groups.at(0);
  if (group === undefined) {
    throw new Error("expected at least one group");
  }
  return group;
}

describe("useAgentSlashCommands prewarm (AC-9)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAuthStore.setState({ user: VIEWER });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ user: null });
    cleanup();
  });

  it("prewarms one request per deduped runtime, reuses the cache on remount inside staleTime, refetches after expiry", async () => {
    const api = installApi();
    const queryClient = makeQueryClient();
    seedCache(queryClient, [
      makeAgent({ id: "a1", runtime_id: "r1" }),
      makeAgent({ id: "a2", runtime_id: "r2" }),
      // Shares r1 with a1 — deduped, must not add a request.
      makeAgent({ id: "r1-sharer", runtime_id: "r1" }),
    ]);

    const first = renderAgentSlashCommands(queryClient);
    await flush();
    expect(api.calls()).toEqual(["r1", "r2"]);

    // Composer close/reopen inside staleTime: same cache, fresh data —
    // ensureQueryData resolves without touching the network.
    first.unmount();
    const second = renderAgentSlashCommands(queryClient);
    await flush();
    expect(api.calls()).toEqual(["r1", "r2"]);

    // After staleTime (30s) expires the next mount refetches.
    second.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000);
    });
    renderAgentSlashCommands(queryClient);
    await flush();
    expect(api.calls()).toEqual(["r1", "r2", "r1", "r2"]);
  });

  it("caps mount prewarm at 8 runtimes; the 9th loads only once its agent is mentioned", async () => {
    const api = installApi();
    const queryClient = makeQueryClient();
    seedCache(
      queryClient,
      Array.from({ length: 9 }, (_, i) =>
        makeAgent({ id: `a${i + 1}`, runtime_id: `r${i + 1}` }),
      ),
    );

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();
    expect(api.calls()).toHaveLength(8);
    expect(api.calls()).not.toContain("r9");

    // Mentioning the capped-out agent lazily loads its runtime.
    const groups = result.current.getAgentCommandGroups(["a9"]);
    await flush();
    expect(api.calls()).toEqual([...Array.from({ length: 8 }, (_, i) => `r${i + 1}`), "r9"]);
    // The group still emits from source A while source C loads.
    expect(groups).toHaveLength(1);
    expect(firstGroup(groups).pending).toBe(true);
    unmount();
  });

  it("never re-requests a runtime the same composer instance already warmed", async () => {
    const api = installApi();
    const queryClient = makeQueryClient();
    seedCache(queryClient, [
      makeAgent({ id: "a1", runtime_id: "r1" }),
      makeAgent({ id: "a2", runtime_id: "r2" }),
    ]);

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();
    expect(api.calls()).toHaveLength(2);

    // Repeat getter calls (keystrokes) must not re-fire a warmed runtime.
    result.current.getAgentCommandGroups(["a1"]);
    result.current.getAgentCommandGroups(["a1"]);
    await flush();
    expect(api.calls()).toEqual(["r1", "r2"]);
    unmount();
  });
});

describe("useAgentSlashCommands getter predicate", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAuthStore.setState({ user: VIEWER });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ user: null });
    cleanup();
  });

  it("excludes agents that are not runtime-bound, archived, or not assignable", async () => {
    installApi();
    const queryClient = makeQueryClient();
    const qualifying = makeAgent({ id: "a-ok", runtime_id: "r-ok" });
    const unbound = makeAgent({
      id: "a-unbound",
      runtime_id: "",
      runtime_bound: false,
    });
    const archived = makeAgent({
      id: "a-archived",
      runtime_id: "r-archived",
      archived_at: "2026-06-01T00:00:00Z",
    });
    const unassignable = makeAgent({
      id: "a-private",
      runtime_id: "r-private",
      owner_id: "user-2",
      // Private mode + non-owner viewer => canAssignAgentToIssue denies.
      invocation_targets: [],
    });
    seedCache(queryClient, [qualifying, unbound, archived, unassignable]);

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();

    // Prewarm only counted the qualifying runtime.
    expect(
      queryClient.getQueryState(runtimeLocalSkillsKeys.forRuntime("r-ok")),
    ).not.toBeNull();
    expect(
      queryClient.getQueryState(runtimeLocalSkillsKeys.forRuntime("r-archived")),
    ).toBeUndefined();

    const groups = result.current.getAgentCommandGroups([
      "a-ok",
      "a-unbound",
      "a-archived",
      "a-private",
      "not-an-agent",
    ]);
    expect(groups).toHaveLength(1);
    expect(firstGroup(groups).agentId).toBe("a-ok");
    unmount();
  });
});

describe("useAgentSlashCommands group state flags", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    useAuthStore.setState({ user: VIEWER });
  });

  afterEach(() => {
    vi.useRealTimers();
    useAuthStore.setState({ user: null });
    cleanup();
  });

  it("flags the group degraded when the enumeration errored, still emitting mounted items", async () => {
    installApi({ failing: ["r-fail"] });
    const queryClient = makeQueryClient();
    seedCache(queryClient, [
      makeAgent({
        id: "a1",
        runtime_id: "r-fail",
        skills: [
          { id: "s1", name: "Run Lint", description: "Lint the change", enabled: true },
        ],
      }),
    ]);

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();
    expect(
      queryClient.getQueryState(runtimeLocalSkillsKeys.forRuntime("r-fail"))
        ?.status,
    ).toBe("error");

    const groups = result.current.getAgentCommandGroups(["a1"]);
    expect(groups).toHaveLength(1);
    expect(firstGroup(groups).degraded).toBe(true);
    expect(firstGroup(groups).pending).toBeUndefined();
    expect(firstGroup(groups).items).toEqual([
      {
        id: "s1",
        label: "run-lint",
        description: "Lint the change",
        source: "mounted",
      },
    ]);
    unmount();
  });

  it("flags the group pending while the enumeration is in flight, emitting source A in the meantime", async () => {
    installApi({ blocked: ["r-slow"] });
    const queryClient = makeQueryClient();
    seedCache(queryClient, [
      makeAgent({
        id: "a1",
        runtime_id: "r-slow",
        skills: [
          { id: "s1", name: "Run Lint", description: "Lint the change", enabled: true },
        ],
      }),
    ]);

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();
    expect(
      queryClient.getQueryState(runtimeLocalSkillsKeys.forRuntime("r-slow"))
        ?.status,
    ).toBe("pending");

    const groups = result.current.getAgentCommandGroups(["a1"]);
    expect(groups).toHaveLength(1);
    expect(firstGroup(groups).pending).toBe(true);
    expect(firstGroup(groups).items).toHaveLength(1);
    unmount();
  });

  it("retryRuntimeSkills re-runs a failed enumeration and clears the degraded flag once data arrives", async () => {
    const api = installApi({ failing: ["r-fail"] });
    const queryClient = makeQueryClient();
    seedCache(queryClient, [
      makeAgent({
        id: "a1",
        runtime_id: "r-fail",
        skills: [
          { id: "s1", name: "Run Lint", description: "Lint the change", enabled: true },
        ],
      }),
    ]);

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();
    expect(
      queryClient.getQueryState(runtimeLocalSkillsKeys.forRuntime("r-fail"))
        ?.status,
    ).toBe("error");

    api.setFailing("r-fail", false);
    await act(async () => {
      await result.current.retryRuntimeSkills("r-fail");
    });
    expect(
      queryClient.getQueryData(runtimeLocalSkillsKeys.forRuntime("r-fail")),
    ).toEqual({
      skills: [
        {
          key: "r-fail-cmd",
          name: "r-fail-cmd",
          description: "Command for r-fail",
          source_path: "/skills/r-fail-cmd",
          provider: "claude",
          file_count: 1,
        },
      ],
      supported: true,
      mcpServers: [],
      mcpSupported: false,
    });

    const groups = result.current.getAgentCommandGroups(["a1"]);
    expect(firstGroup(groups).degraded).toBe(false);
    expect(firstGroup(groups).items.map((item) => item.label)).toEqual([
      "run-lint",
      "r-fail-cmd",
    ]);
    unmount();
  });

  it("passes runtime skills through to the catalog, honoring disabled_runtime_skills", async () => {
    const api = installApi();
    const queryClient = makeQueryClient();
    seedCache(queryClient, [
      makeAgent({
        id: "a1",
        runtime_id: "r1",
        disabled_runtime_skills: [
          { runtime_id: "r1", provider: "claude", root: "provider", key: "r1-cmd" },
        ],
      }),
    ]);
    seedRuntimeSkills(queryClient, "r1", [
      {
        key: "r1-cmd",
        name: "r1-cmd",
        description: "",
        source_path: "",
        provider: "claude",
        file_count: 1,
      },
      {
        key: "ship",
        name: "ship",
        description: "Ship the change",
        source_path: "/skills/ship",
        provider: "claude",
        file_count: 1,
      },
    ]);

    const { result, unmount } = renderAgentSlashCommands(queryClient);
    await flush();
    // Pre-seeded fresh data means the mount prewarm sends no request.
    expect(api.calls()).toEqual([]);

    const groups = result.current.getAgentCommandGroups(["a1"]);
    // The disabled key is filtered; only "ship" survives from source C.
    expect(firstGroup(groups).items.map((item) => item.label)).toEqual(["ship"]);
    expect(firstGroup(groups).degraded).toBe(false);
    unmount();
  });
});
