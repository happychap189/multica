import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@multica/core/i18n/react";
import { workspaceKeys } from "@multica/core/workspace/queries";
import type { Agent, MemberWithUser } from "@multica/core/types";
import type { QueryClient } from "@tanstack/react-query";
import enEditor from "../../locales/en/editor.json";

const TEST_RESOURCES = {
  en: { editor: enEditor },
};

function I18nWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locale="en" resources={TEST_RESOURCES}>
      {children}
    </I18nProvider>
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

vi.mock("@multica/core/platform", () => ({
  getCurrentWsId: () => "ws-1",
}));

const authState = { user: { id: "u1" } as { id: string } | null };
vi.mock("@multica/core/auth", () => ({
  useAuthStore: { getState: () => authState },
}));

const chatState = { selectedAgentId: "agent-1" as string | null };
vi.mock("@multica/core/chat", () => ({
  useChatStore: { getState: () => chatState },
}));

// Only the render-closure test mounts the popup component, and it does so
// through ReactRenderer; stubbing it captures the exact props object getProps
// produced without mounting a real component tree (which would need the I18n
// provider ReactRenderer cannot see).
const rendererProps = vi.hoisted(() => ({
  captured: [] as Array<Record<string, unknown>>,
}));
vi.mock("@tiptap/react", () => ({
  ReactRenderer: class {
    element = document.createElement("div");
    constructor(_component: unknown, options: { props: Record<string, unknown> }) {
      rendererProps.captured.push(options.props);
    }
    updateProps() {}
    destroy() {}
  },
}));

import {
  SlashCommandList,
  type SlashCommandListRef,
  createSlashCommandSuggestion,
  type SlashCommandItem,
  buildBuiltinCommandItems,
  BUILTIN_COMMANDS,
  createBuiltinCommandSuggestion,
  mentionedAgentIdsFromDoc,
  buildAgentGroupMenuItems,
  QUICK_ACTION_ITEM_PREFIX,
} from "./slash-command-suggestion";
import { buildAgentCommandCatalog, type AgentCommandEntry, type AgentCommandGroup } from "@multica/core/agents";

function agent(overrides: Partial<Agent>): Agent {
  return {
    id: "agent-1",
    workspace_id: "ws-1",
    runtime_id: "runtime-1",
    name: "Agent",
    description: "",
    instructions: "",
    avatar_url: null,
    runtime_mode: "local",
    runtime_config: {},
    custom_args: [],
    visibility: "workspace",
    permission_mode: "public_to",
    invocation_targets: [{ target_type: "workspace", target_id: null }],
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

function fakeQc(data: {
  members?: Array<Pick<MemberWithUser, "user_id" | "name" | "role">>;
  agents?: Agent[];
}): QueryClient {
  const map = new Map<string, unknown>();
  map.set(JSON.stringify(workspaceKeys.members("ws-1")), data.members ?? []);
  map.set(JSON.stringify(workspaceKeys.agents("ws-1")), data.agents ?? []);
  return {
    getQueryData: (key: readonly unknown[]) => map.get(JSON.stringify(key)),
  } as unknown as QueryClient;
}

function items(
  qc: QueryClient,
  query = "",
  options: Parameters<typeof createSlashCommandSuggestion>[1] = {},
): SlashCommandItem[] {
  const config = createSlashCommandSuggestion(qc, options);
  return config.items!({
    query,
    editor: {} as never,
    signal: new AbortController().signal,
  }) as SlashCommandItem[];
}

const noopGetter = () => [];

describe("chat `/` menu — catalog items", () => {
  it("calls the catalog getter with the chat-selected agent id and lists its commands under group metadata", () => {
    chatState.selectedAgentId = "agent-1";
    const getGroups = vi.fn(() => [
      agentGroupFixture({
        items: [agentEntry("deploy", "Ship changes"), agentEntry("review")],
      }),
    ]);
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });

    expect(items(qc, "", { getAgentCommandGroups: getGroups })).toEqual([
      {
        id: "agent-command:agent-1:deploy",
        label: "deploy",
        description: "Ship changes",
        group: { agentName: "Atlas", degraded: false, pending: false, runtimeId: "runtime-1" },
      },
      {
        id: "agent-command:agent-1:review",
        label: "review",
        description: "",
        group: { agentName: "Atlas", degraded: false, pending: false, runtimeId: "runtime-1" },
      },
    ]);
    expect(getGroups).toHaveBeenCalledWith(["agent-1"]);
  });

  it("falls back to the first available agent when selectedAgentId is stale", () => {
    chatState.selectedAgentId = "missing";
    const getGroups = vi.fn(() => [
      agentGroupFixture({ items: [agentEntry("deploy")] }),
    ]);
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });

    items(qc, "", { getAgentCommandGroups: getGroups });
    expect(getGroups).toHaveBeenCalledWith(["agent-1"]);
  });

  it("returns empty (and never calls the getter) when no agents exist", () => {
    chatState.selectedAgentId = "agent-1";
    const getGroups = vi.fn();
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [],
    });

    expect(items(qc, "", { getAgentCommandGroups: getGroups })).toEqual([]);
    expect(getGroups).not.toHaveBeenCalled();
  });

  it("excludes a private agent the viewer cannot access", () => {
    chatState.selectedAgentId = "private-agent";
    const getGroups = vi.fn();
    const qc = fakeQc({
      members: [
        { user_id: "u1", name: "Alice", role: "member" },
        { user_id: "u2", name: "Bob", role: "member" },
      ],
      agents: [
        agent({
          id: "private-agent",
          visibility: "private",
          permission_mode: "private",
          invocation_targets: [],
          owner_id: "u2",
          skills: [{ id: "private-skill", name: "secret", description: "" }],
        }),
      ],
    });

    expect(items(qc, "", { getAgentCommandGroups: getGroups })).toEqual([]);
    expect(getGroups).not.toHaveBeenCalled();
  });

  it("returns empty when the getter option is absent", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });

    expect(items(qc)).toEqual([]);
  });

  it("filters group entries by query, keeping group metadata", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });
    const getGroups = () => [
      agentGroupFixture({
        items: [agentEntry("deploy-web"), agentEntry("review-pr")],
      }),
    ];

    const result = items(qc, "dep", { getAgentCommandGroups: getGroups });
    expect(result.map((i) => i.label)).toEqual(["deploy-web"]);
    expect(result[0]?.group?.agentName).toBe("Atlas");
  });

  it("truncates a single group at the 20-item menu budget (builtinCount 0)", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });
    const getGroups = () => [
      agentGroupFixture({
        items: Array.from({ length: 25 }, (_, i) =>
          agentEntry("cmd-" + String(i).padStart(2, "0")),
        ),
      }),
    ];

    const result = items(qc, "", { getAgentCommandGroups: getGroups });
    expect(result).toHaveLength(20);
    expect(result[0]?.label).toBe("cmd-00");
    expect(result[19]?.label).toBe("cmd-19");
  });

  it("keeps plugin-prefixed labels verbatim", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });
    const getGroups = () => [
      agentGroupFixture({ items: [agentEntry("oh-my-claudecode:deep-interview")] }),
    ];

    expect(items(qc, "", { getAgentCommandGroups: getGroups })[0]?.label).toBe(
      "oh-my-claudecode:deep-interview",
    );
  });

  it("passes degraded group metadata through to the items", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });

    const result = items(qc, "", { getAgentCommandGroups: () => [
      agentGroupFixture({ degraded: true, items: [agentEntry("ship")] }),
    ] });
    expect(result[0]?.group).toEqual({
      agentName: "Atlas",
      degraded: true,
      pending: false,
      runtimeId: "runtime-1",
    });
  });

  it("passes pending group metadata through to the items", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });

    const result = items(qc, "", { getAgentCommandGroups: () => [
      agentGroupFixture({ pending: true, items: [agentEntry("triage")] }),
    ] });
    expect(result[0]?.group).toEqual({
      agentName: "Atlas",
      degraded: false,
      pending: true,
      runtimeId: "runtime-1",
    });
  });

  it("returns empty when the selected agent qualifies but the getter resolves nothing", () => {
    chatState.selectedAgentId = "agent-1";
    const qc = fakeQc({
      members: [{ user_id: "u1", name: "Alice", role: "member" }],
      agents: [agent({ id: "agent-1" })],
    });

    expect(items(qc, "", { getAgentCommandGroups: noopGetter })).toEqual([]);
  });
});

describe("SlashCommandList keyboard handling", () => {
  it("lets Enter and arrow keys fall through when there are no selectable items", () => {
    const ref = createRef<SlashCommandListRef>();

    render(
      <I18nWrapper>
        <SlashCommandList ref={ref} items={[]} query="" command={vi.fn()} />
      </I18nWrapper>,
    );

    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Enter" }),
      }),
    ).toBe(false);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Enter", metaKey: true }),
      }),
    ).toBe(false);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowUp" }),
      }),
    ).toBe(false);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
      }),
    ).toBe(false);
  });

  it("handles Enter and arrow keys when selectable items exist", () => {
    const ref = createRef<SlashCommandListRef>();
    const command = vi.fn();
    const selectableItems: SlashCommandItem[] = [
      { id: "s1", label: "deploy", description: "Ship changes" },
      { id: "s2", label: "review", description: "Review code" },
    ];

    render(
      <I18nWrapper>
        <SlashCommandList
          ref={ref}
          items={selectableItems}
          query=""
          command={command}
        />
      </I18nWrapper>,
    );

    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowUp" }),
      }),
    ).toBe(true);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "ArrowDown" }),
      }),
    ).toBe(true);
    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Enter" }),
      }),
    ).toBe(true);
    expect(command).toHaveBeenCalledWith(selectableItems[0]);
  });

  // MUL-5495: same Ctrl aliases the command bar (cmdk) accepts, so the slash
  // picker navigates like every other list in the product.
  it("navigates with Ctrl+N/J and Ctrl+P/K, and leaves the bare letters alone", () => {
    const ref = createRef<SlashCommandListRef>();
    const command = vi.fn();
    const selectableItems: SlashCommandItem[] = [
      { id: "s1", label: "deploy", description: "Ship changes" },
      { id: "s2", label: "review", description: "Review code" },
      { id: "s3", label: "note", description: "Leave a note" },
    ];

    render(
      <I18nWrapper>
        <SlashCommandList
          ref={ref}
          items={selectableItems}
          query=""
          command={command}
        />
      </I18nWrapper>,
    );

    const highlightedLabel = () => {
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
      return buttons.find((b) => b.classList.contains("bg-accent"))?.textContent ?? "";
    };
    let handled: boolean | undefined;
    const press = (init: KeyboardEventInit) =>
      act(() => {
        handled = ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", init) });
      });

    press({ key: "n", ctrlKey: true });
    expect(handled).toBe(true);
    expect(highlightedLabel()).toContain("/review");

    press({ key: "j", ctrlKey: true });
    expect(highlightedLabel()).toContain("/note");

    press({ key: "p", ctrlKey: true });
    expect(highlightedLabel()).toContain("/review");

    press({ key: "k", ctrlKey: true });
    expect(highlightedLabel()).toContain("/deploy");

    // Bare letters stay query characters — "/note" must remain typeable.
    press({ key: "n" });
    expect(handled).toBe(false);
    expect(highlightedLabel()).toContain("/deploy");

    press({ key: "Enter" });
    expect(command).toHaveBeenCalledWith(selectableItems[0]);
  });

  // MUL-3685: plain Tab accepts the highlighted item like Enter; Shift+Tab and
  // modifier+Tab fall through so reverse focus / OS switching are preserved.
  it("accepts the highlighted item on plain Tab, ignoring Shift/modifier+Tab", () => {
    const ref = createRef<SlashCommandListRef>();
    const command = vi.fn();
    const selectableItems: SlashCommandItem[] = [
      { id: "s1", label: "deploy", description: "Ship changes" },
      { id: "s2", label: "review", description: "Review code" },
    ];

    render(
      <I18nWrapper>
        <SlashCommandList
          ref={ref}
          items={selectableItems}
          query=""
          command={command}
        />
      </I18nWrapper>,
    );

    const press = (init: KeyboardEventInit) =>
      ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", init) });

    expect(press({ key: "Tab", shiftKey: true })).toBe(false);
    expect(press({ key: "Tab", metaKey: true })).toBe(false);
    expect(command).not.toHaveBeenCalled();

    expect(press({ key: "Tab" })).toBe(true);
    expect(command).toHaveBeenCalledWith(selectableItems[0]);
  });

  it("lets Tab fall through when there are no selectable items, like Enter", () => {
    const ref = createRef<SlashCommandListRef>();

    render(
      <I18nWrapper>
        <SlashCommandList ref={ref} items={[]} query="" command={vi.fn()} />
      </I18nWrapper>,
    );

    expect(
      ref.current?.onKeyDown({
        event: new KeyboardEvent("keydown", { key: "Tab" }),
      }),
    ).toBe(false);
  });
});

describe("SlashCommandList empty states", () => {
  it("shows a configured-skills empty state before search text is entered", () => {
    const { getByText } = render(
      <I18nWrapper>
        <SlashCommandList items={[]} query="" command={vi.fn()} />
      </I18nWrapper>,
    );

    expect(getByText("No skills configured")).toBeInTheDocument();
  });

  it("shows a no-results empty state when search text has no matches", () => {
    const { getByText } = render(
      <I18nWrapper>
        <SlashCommandList items={[]} query="deploy" command={vi.fn()} />
      </I18nWrapper>,
    );

    expect(getByText("No matching skills")).toBeInTheDocument();
  });

  it("renders nothing on empty items when hideOnEmpty is set (command menu)", () => {
    const { container } = render(
      <I18nWrapper>
        <SlashCommandList items={[]} query="6" command={vi.fn()} hideOnEmpty />
      </I18nWrapper>,
    );

    // No popup box on a non-matching `/` (e.g. typing a date like 6/8).
    expect(container).toBeEmptyDOMElement();
  });
});

describe("buildBuiltinCommandItems", () => {
  it("returns the full built-in command set for an empty query", () => {
    expect(buildBuiltinCommandItems("")).toEqual(BUILTIN_COMMANDS);
  });

  it("includes /note while the query is a prefix of the label", () => {
    expect(buildBuiltinCommandItems("no").map((c) => c.id)).toEqual(["note"]);
    expect(buildBuiltinCommandItems("NOTE").map((c) => c.id)).toEqual(["note"]);
  });

  it("matches the label as a prefix only — not the description", () => {
    // "agent" appears in the description but is not a label prefix.
    expect(buildBuiltinCommandItems("agent")).toEqual([]);
    // A non-prefix substring of the label does not match either.
    expect(buildBuiltinCommandItems("ote")).toEqual([]);
  });

  it("returns nothing for a query that matches no command", () => {
    expect(buildBuiltinCommandItems("deploy")).toEqual([]);
  });
});

describe("SlashCommandList built-in command rendering", () => {
  it("renders the localized description for a built-in command", () => {
    const { getByText } = render(
      <I18nWrapper>
        <SlashCommandList
          items={buildBuiltinCommandItems("")}
          query=""
          command={vi.fn()}
          hideOnEmpty
        />
      </I18nWrapper>,
    );

    expect(getByText("/note")).toBeInTheDocument();
    expect(
      getByText("Add a note — won't trigger any agents"),
    ).toBeInTheDocument();
  });
});


// Async quick-action rendering in the `/` menu (MUL-5465, review finding #4).
//
// The render request resolves after an arbitrary delay, during which the user
// keeps typing. Three behaviours have to hold, and each one was a real bug at
// some point in this PR:
//   - a rejection must not destroy what the user typed
//   - a success must replace the ORIGINAL command, not wherever the caret is
//   - a command edited mid-flight must be left alone, not overwritten
describe("builtin `/` menu — async quick action rendering", () => {
  // Minimal editor stand-in: enough ProseMirror surface for the command to
  // read the range text and issue its chain.
  function fakeEditor(text: string) {
    const calls: { from: number; to: number; content: string; contentType?: string }[] = [];
    let docText = text;
    const chain = {
      focus: () => chain,
      insertContentAt: (
        range: { from: number; to: number },
        content: string,
        opts?: { contentType?: string },
      ) => {
        calls.push({ from: range.from, to: range.to, content, contentType: opts?.contentType });
        return chain;
      },
      insertContent: (content: string) => {
        calls.push({ from: -1, to: -1, content });
        return chain;
      },
      deleteRange: () => chain,
      run: () => true,
    };
    return {
      calls,
      setText: (next: string) => {
        docText = next;
      },
      editor: {
        chain: () => chain,
        state: {
          doc: {
            get content() {
              return { size: docText.length + 1 };
            },
            textBetween: (from: number, to: number) => docText.slice(from, to),
          },
        },
        view: { state: { selection: { $to: { nodeAfter: null } } } },
      },
    };
  }

  const range = { from: 0, to: 7 };
  const item = { id: `${QUICK_ACTION_ITEM_PREFIX}qa-1`, label: "review" };

  it("leaves the typed command intact and reports the failure when render rejects", async () => {
    const { editor, calls } = fakeEditor("/review");
    const onRenderError = vi.fn();
    const suggestion = createBuiltinCommandSuggestion({
      renderQuickAction: () => Promise.reject(new Error("boom")),
      onRenderError,
    });

    suggestion.command!({ editor, range, props: item } as never);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toHaveLength(0);
    expect(onRenderError).toHaveBeenCalledTimes(1);
  });

  it("replaces the original range once a delayed render resolves", async () => {
    const { editor, calls } = fakeEditor("/review");
    let resolve!: (v: string) => void;
    const suggestion = createBuiltinCommandSuggestion({
      renderQuickAction: () => new Promise<string>((r) => { resolve = r; }),
    });

    suggestion.command!({ editor, range, props: item } as never);
    expect(calls).toHaveLength(0); // nothing destroyed while in flight

    await act(async () => {
      resolve("rendered body");
      await Promise.resolve();
      await Promise.resolve();
    });

    // contentType must be "markdown": inserted as a plain string, the
    // server-rendered `[@Name](mention://…)` lands as literal text and
    // serialises back out with escaped brackets, so the mention never becomes
    // a node and renders as raw markup in the thread.
    expect(calls).toEqual([
      { from: 0, to: 7, content: "rendered body", contentType: "markdown" },
    ]);
  });

  it("abandons the insert when the command was edited while the request was open", async () => {
    const { editor, calls, setText } = fakeEditor("/review");
    let resolve!: (v: string) => void;
    const suggestion = createBuiltinCommandSuggestion({
      renderQuickAction: () => new Promise<string>((r) => { resolve = r; }),
    });

    suggestion.command!({ editor, range, props: item } as never);
    // The user rewrites the command; a prefix-only check would still see a
    // leading "/" here and clobber it.
    setText("/fixnow");

    await act(async () => {
      resolve("rendered body");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Agent command groups (issue-comment `/` menu) — S3/S4/S5/S6
// ---------------------------------------------------------------------------

/** Runtime entry fixture; label defaults to the key itself. */
function agentEntry(id: string, description?: string): AgentCommandEntry {
  return { id, label: id, description, source: "runtime" };
}

/** Group fixture with per-test overrides. */
function agentGroupFixture(overrides: {
  id?: string;
  name?: string;
  runtimeId?: string;
  degraded?: boolean;
  pending?: boolean;
  items?: AgentCommandEntry[];
} = {}): AgentCommandGroup {
  const {
    id = "agent-1",
    name = "Atlas",
    runtimeId = "runtime-1",
    degraded = false,
    pending = false,
    items = [],
  } = overrides;
  return {
    agentId: id,
    agentName: name,
    runtimeId,
    degraded,
    pending,
    items,
  };
}

/** Minimal doc stand-in exposing only what mentionedAgentIdsFromDoc walks. */
function fakeDoc(ids: Array<{ type?: string; id: string }>) {
  return {
    descendants: (cb: (node: unknown) => boolean | void) => {
      for (const { type, id } of ids) {
        cb({
          type: { name: type === undefined ? "mention" : type },
          attrs: { type: type === undefined ? "agent" : type, id },
        });
      }
    },
  };
}

function fakeGroupEditor(doc: unknown) {
  return { state: { doc } } as never;
}

function builtinItems(
  suggestion: ReturnType<typeof createBuiltinCommandSuggestion>,
  editor: never,
  query = "",
): SlashCommandItem[] {
  return suggestion.items!({
    query,
    editor,
    signal: new AbortController().signal,
  }) as SlashCommandItem[];
}

describe("mentionedAgentIdsFromDoc", () => {
  it("collects agent mention ids in document order, deduped", () => {
    expect(
      mentionedAgentIdsFromDoc(fakeDoc([{ id: "a2" }, { id: "a1" }, { id: "a2" }]) as never),
    ).toEqual(["a2", "a1"]);
  });

  it("ignores member/issue mentions and non-mention nodes", () => {
    expect(
      mentionedAgentIdsFromDoc(fakeDoc([{ type: "member", id: "u9" }, { type: "issue", id: "i1" }]) as never),
    ).toEqual([]);
  });

  it("tolerates a missing doc", () => {
    expect(mentionedAgentIdsFromDoc(undefined)).toEqual([]);
  });
});

describe("builtin `/` menu — agent group composition", () => {
  it("returns built-ins unchanged when the doc mentions no agent", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: noopGetter,
    });
    const editor = fakeGroupEditor(fakeDoc([]));
    expect(builtinItems(suggestion, editor)).toEqual(buildBuiltinCommandItems(""));
  });
});

describe("builtin `/` menu — group composition (AC-1 no-getter)", () => {
  it("returns built-ins unchanged when the getter option is absent, even with mentions", () => {
    const suggestion = createBuiltinCommandSuggestion({});
    const editor = fakeGroupEditor(fakeDoc([{ id: "agent-1" }]));
    expect(builtinItems(suggestion, editor)).toEqual(buildBuiltinCommandItems(""));
  });

  it("returns only built-ins when the getter resolves nothing for a mentioned id", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => [],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "ghost" }]));
    expect(builtinItems(suggestion, editor)).toEqual(buildBuiltinCommandItems(""));
  });
});

describe("builtin `/` menu — group metadata and ordering", () => {
  it("appends one group after the built-ins, carrying group metadata", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => [
        agentGroupFixture({
          items: [agentEntry("review-pr", "Review a pull request"), agentEntry("deploy")],
        }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "agent-1" }]));

    expect(builtinItems(suggestion, editor)).toEqual([
      { id: "note", label: "note", descriptionKey: "note" },
      {
        id: "agent-command:agent-1:review-pr",
        label: "review-pr",
        description: "Review a pull request",
        group: { agentName: "Atlas", degraded: false, pending: false, runtimeId: "runtime-1" },
      },
      {
        id: "agent-command:agent-1:deploy",
        label: "deploy",
        description: "",
        group: { agentName: "Atlas", degraded: false, pending: false, runtimeId: "runtime-1" },
      },
    ]);
  });

  it("appends both mentioned agents' groups in order", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => [
        agentGroupFixture({ id: "a1", name: "Atlas", items: [agentEntry("ship")] }),
        agentGroupFixture({ id: "a2", name: "Vega", runtimeId: "runtime-2", items: [agentEntry("triage")] }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "a1" }, { id: "a2" }]));

    const result = builtinItems(suggestion, editor);
    expect(result.map((i) => i.label)).toEqual(["note", "ship", "triage"]);
    expect(result.map((i) => i.group?.agentName)).toEqual([undefined, "Atlas", "Vega"]);
  });
});

describe("builtin `/` menu — group filtering (S5)", () => {
  it("filters within a group without touching other groups", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => [
        agentGroupFixture({
          id: "a1",
          name: "Atlas",
          items: [agentEntry("deploy-web"), agentEntry("review-pr")],
        }),
        agentGroupFixture({ id: "a2", name: "Vega", runtimeId: "runtime-2", items: [agentEntry("gamma")] }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "a1" }, { id: "a2" }]));

    // Atlas has no "gam" match and drops out entirely; Vega keeps gamma.
    // (The note built-in drops out too: builtin labels match by prefix only.)
    const result = builtinItems(suggestion, editor, "gam");
    expect(result.map((i) => i.label)).toEqual(["gamma"]);
    expect(result[0]?.group?.agentName).toBe("Vega");
  });

  it("matches a Chinese description by pinyin query", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => [
        agentGroupFixture({
          items: [agentEntry("review", "代码审查"), agentEntry("unrelated")],
        }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "agent-1" }]));

    expect(builtinItems(suggestion, editor, "daima").map((i) => i.label)).toEqual(["review"]);
  });
});

describe("builtin `/` menu — note avoidance through the real catalog", () => {
  it("never surfaces a note-normalized label in the composed items", () => {
    // The core catalog drops entries whose label normalizes to the reserved
    // /note command; this pins the whole chain at the items level.
    const groups = buildAgentCommandCatalog({
      agents: [
        {
          ...agent({ id: "agent-1", runtime_id: "runtime-1", skills: [{ id: "s-note", name: "NOTE", description: "" }] }),
          runtime_bound: true,
        } as Agent,
      ],
      runtimeSkillsByRuntime: new Map([
        ["runtime-1", [{ key: "note", name: "Note", source_path: "/s", provider: "claude", file_count: 1 }]],
      ]),
    });
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => groups,
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "agent-1" }]));

    // Both sources contribute a note-normalized entry; both are dropped, so
    // the built-in note command is the only note in the composed items.
    expect(builtinItems(suggestion, editor).map((i) => i.label)).toEqual(["note"]);
  });

  it("keeps `plugin:` prefixed labels verbatim in the items", () => {
    const suggestion = createBuiltinCommandSuggestion({
      getAgentCommandGroups: () => [
        agentGroupFixture({ items: [agentEntry("oh-my-claudecode:deep-interview")] }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "agent-1" }]));

    expect(builtinItems(suggestion, editor)[1]?.label).toBe("oh-my-claudecode:deep-interview");
  });
});

describe("builtin `/` menu — agent group truncation (budget, not hard cap)", () => {
  function manyEntries(n: number): AgentCommandEntry[] {
    return Array.from({ length: n }, (_, i) => agentEntry(`cmd-${String(i).padStart(2, "0")}`));
  }

  it("guarantees each group one item when 20 quick actions fill the budget", () => {
    const quickActions = Array.from({ length: 20 }, (_, i) => ({ id: `qa-${i}`, name: `action-${i}` }));
    const suggestion = createBuiltinCommandSuggestion({
      getQuickActions: () => quickActions,
      getAgentCommandGroups: () => [
        agentGroupFixture({ id: "a1", items: manyEntries(10) }),
        agentGroupFixture({ id: "a2", name: "Vega", runtimeId: "runtime-2", items: manyEntries(10) }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "a1" }, { id: "a2" }]));

    // 20 builtins + 1 guaranteed entry per group = 22 (budget exceeded by design).
    const result = builtinItems(suggestion, editor);
    expect(result).toHaveLength(22);
    const atlas = result.filter((i) => i.group?.agentName === "Atlas");
    const vega = result.filter((i) => i.group?.agentName === "Vega");
    expect(atlas).toHaveLength(1);
    expect(vega).toHaveLength(1);
    // The guaranteed entry is the group's top-ranked one.
    expect(atlas[0]?.label).toBe("cmd-00");
    expect(vega[0]?.label).toBe("cmd-00");
  });

  it("fills groups round-robin within the remaining budget", () => {
    const quickActions = Array.from({ length: 3 }, (_, i) => ({ id: `qa-${i}`, name: `action-${i}` }));
    const suggestion = createBuiltinCommandSuggestion({
      getQuickActions: () => quickActions,
      getAgentCommandGroups: () => [
        agentGroupFixture({ id: "a1", items: manyEntries(15) }),
        agentGroupFixture({ id: "a2", name: "Vega", runtimeId: "runtime-2", items: manyEntries(15) }),
      ],
    });
    const editor = fakeGroupEditor(fakeDoc([{ id: "a1" }, { id: "a2" }]));

    // budget = 20 - 4 builtins (3 quick actions + note) - 2 guarantees = 14
    // -> 7 full rounds of (Atlas, Vega); per-group rank order survives.
    const result = builtinItems(suggestion, editor);
    expect(result).toHaveLength(20);
    const atlas = result.filter((i) => i.group?.agentName === "Atlas");
    const vega = result.filter((i) => i.group?.agentName === "Vega");
    expect(atlas).toHaveLength(8);
    expect(vega).toHaveLength(8);
    expect(atlas[0]?.label).toBe("cmd-00");
    expect(atlas[7]?.label).toBe("cmd-07");
    expect(vega[7]?.label).toBe("cmd-07");
  });
});

describe("SlashCommandList group header rendering", () => {
  const queryCommand = vi.fn();

  function groupItemsFixture() {
    return buildAgentGroupMenuItems(
      [
        agentGroupFixture({ id: "a1", items: [agentEntry("ship"), agentEntry("sail")] }),
        agentGroupFixture({ id: "a2", name: "Vega", runtimeId: "runtime-2", items: [agentEntry("triage")] }),
      ],
      "",
      1, // one built-in (the note command) ahead of the groups
    );
  }

  it("renders a header at each group boundary, without adding focusable stops", () => {
    const { getByText } = render(
      <I18nWrapper>
        <SlashCommandList
          items={[...buildBuiltinCommandItems(""), ...groupItemsFixture()]}
          query=""
          command={queryCommand}
          hideOnEmpty
          onRetryRuntimeSkills={vi.fn()}
        />
      </I18nWrapper>,
    );

    expect(getByText("Atlas")).toBeInTheDocument();
    expect(getByText("Vega")).toBeInTheDocument();
    // Headers are plain rows: the only buttons remain the navigable items
    // (1 built-in + 3 group entries).
    expect(document.querySelectorAll("button")).toHaveLength(4);
  });

  it("renders the degraded notice plus retry control; retry fires with runtimeId", async () => {
    const onRetry = vi.fn();
    const { getByText } = render(
      <I18nWrapper>
        <SlashCommandList
          items={buildAgentGroupMenuItems(
            [agentGroupFixture({ degraded: true, items: [agentEntry("ship")] })],
            "",
            0,
          )}
          query=""
          command={queryCommand}
          hideOnEmpty
          onRetryRuntimeSkills={onRetry}
        />
      </I18nWrapper>,
    );

    expect(getByText("Runtime skills unavailable")).toBeInTheDocument();
    act(() => {
      fireEvent.click(getByText("Retry"));
    });
    expect(onRetry).toHaveBeenCalledWith("runtime-1");
    // Clicking retry must not select an item.
    expect(queryCommand).not.toHaveBeenCalled();
  });

  it("renders the pending loading state instead of the degraded control", () => {
    const { getByText, queryByText } = render(
      <I18nWrapper>
        <SlashCommandList
          items={buildAgentGroupMenuItems(
            [agentGroupFixture({ pending: true, items: [agentEntry("ship")] })],
            "",
            0,
          )}
          query=""
          command={queryCommand}
          hideOnEmpty
          onRetryRuntimeSkills={vi.fn()}
        />
      </I18nWrapper>,
    );

    expect(getByText("Loading…")).toBeInTheDocument();
    expect(queryByText("Retry")).not.toBeInTheDocument();
  });
});

describe("SlashCommandList group keyboard + IME", () => {
  function groupItemsFixture() {
    return [
      ...buildBuiltinCommandItems(""),
      ...buildAgentGroupMenuItems(
        [
          agentGroupFixture({ id: "a1", items: [agentEntry("ship"), agentEntry("sail")] }),
          agentGroupFixture({ id: "a2", name: "Vega", runtimeId: "runtime-2", items: [agentEntry("triage")] }),
        ],
        "",
        1,
      ),
    ];
  }

  it("cycles across group boundaries; headers are not stops; Enter accepts a group item", () => {
    const command = vi.fn();
    const ref = createRef<SlashCommandListRef>();
    const items = groupItemsFixture();
    render(
      <I18nWrapper>
        <SlashCommandList ref={ref} items={items} query="" command={command} hideOnEmpty />
      </I18nWrapper>,
    );

    const press = (init: KeyboardEventInit) => {
      let handled: boolean | undefined;
      act(() => {
        handled = ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", init) });
      });
      return handled;
    };

    expect(press({ key: "ArrowDown" })).toBe(true);
    const highlighted = () =>
      Array.from(document.querySelectorAll("button")).find((b) => b.classList.contains("bg-accent"))
        ?.textContent ?? "";
    // index 0 -> 1: crossed the built-in -> Atlas boundary (no header stop).
    expect(highlighted()).toContain("/ship");
    expect(press({ key: "ArrowDown" })).toBe(true); // -> sail (within Atlas)
    expect(highlighted()).toContain("/sail");
    expect(press({ key: "ArrowDown" })).toBe(true); // -> triage (crossed into Vega)
    expect(highlighted()).toContain("/triage");
    expect(press({ key: "Enter" })).toBe(true);
    expect(command).toHaveBeenCalledWith(items[3]);
  });

  it("accepts a group item on plain Tab", () => {
    const command = vi.fn();
    const ref = createRef<SlashCommandListRef>();
    const items = groupItemsFixture();
    render(
      <I18nWrapper>
        <SlashCommandList ref={ref} items={items} query="" command={command} hideOnEmpty />
      </I18nWrapper>,
    );

    const press = (init: KeyboardEventInit) => {
      let handled: boolean | undefined;
      act(() => {
        handled = ref.current?.onKeyDown({ event: new KeyboardEvent("keydown", init) });
      });
      return handled;
    };
    press({ key: "ArrowDown" });
    expect(press({ key: "Tab" })).toBe(true);
  });

  it("lets IME-composed keys pass through without accepting", () => {
    const command = vi.fn();
    const ref = createRef<SlashCommandListRef>();
    render(
      <I18nWrapper>
        <SlashCommandList ref={ref} items={groupItemsFixture()} query="" command={command} hideOnEmpty />
      </I18nWrapper>,
    );

    const imeEnter = new KeyboardEvent("keydown", { key: "Enter", isComposing: true });
    expect(ref.current?.onKeyDown({ event: imeEnter })).toBe(false);
    expect(command).not.toHaveBeenCalled();

    // Safari's composition commit can clear isComposing before keydown.
    const safariCommit = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(safariCommit, "keyCode", { value: 229 });
    expect(ref.current?.onKeyDown({ event: safariCommit })).toBe(false);
    expect(command).not.toHaveBeenCalled();
  });
});

describe("builtin `/` menu — agent command insertion (S4)", () => {
  function recordingEditor() {
    const calls: { from: number; to: number; content: unknown }[] = [];
    const chain = {
      focus: () => chain,
      insertContentAt: (_range: { from: number; to: number }, content: unknown) => {
        calls.push({ from: _range.from, to: _range.to, content });
        return chain;
      },
      run: () => true,
    };
    return {
      calls,
      editor: { chain: () => chain, state: { doc: { textBetween: () => "" } }, view: { state: { selection: { $to: { nodeAfter: null } } } } } as never,
    };
  }

  function groupItem(label: string, description?: string): SlashCommandItem {
    return {
      id: `agent-command:agent-1:${label}`,
      label,
      description: description ?? "",
      group: { agentName: "Atlas", degraded: false, pending: false, runtimeId: "runtime-1" },
    };
  }

  it("inserts plain `/label ` text for a group item, caret at the param position", () => {
    const { calls, editor } = recordingEditor();
    const collapseToEnd = vi.fn();
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ collapseToEnd } as unknown as Selection);

    const suggestion = createBuiltinCommandSuggestion({});
    suggestion.command!({ editor, range: { from: 0, to: 5 }, props: groupItem("ship") } as never);

    expect(calls).toEqual([
      { from: 0, to: 5, content: [{ type: "text", text: "/ship " }] },
    ]);
    expect(collapseToEnd).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("inserts a long plugin-prefixed label verbatim", () => {
    const { calls, editor } = recordingEditor();
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ collapseToEnd: vi.fn() } as unknown as Selection);

    const suggestion = createBuiltinCommandSuggestion({});
    suggestion.command!({ editor, range: { from: 0, to: 30 }, props: groupItem("oh-my-claudecode:deep-interview") } as never);

    expect(calls[0]?.content).toEqual([{ type: "text", text: "/oh-my-claudecode:deep-interview " }]);
    spy.mockRestore();
  });

  it("ignores the description when inserting", () => {
    const { calls, editor } = recordingEditor();
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ collapseToEnd: vi.fn() } as unknown as Selection);

    const suggestion = createBuiltinCommandSuggestion({});
    suggestion.command!({ editor, range: { from: 0, to: 6 }, props: groupItem("ship", "Ship the change") } as never);

    expect(calls[0]?.content).toEqual([{ type: "text", text: "/ship " }]);
    spy.mockRestore();
  });
});

describe("chat `/` menu — plain-text insertion", () => {
  function chatRecordingEditor() {
    const calls: { from: number; to: number; content: unknown }[] = [];
    const chain = {
      focus: () => chain,
      insertContentAt: (_range: { from: number; to: number }, content: unknown) => {
        calls.push({ from: _range.from, to: _range.to, content });
        return chain;
      },
      run: () => true,
    };
    return {
      calls,
      editor: { chain: () => chain, state: { doc: { textBetween: () => "" } }, view: { state: { selection: { $to: { nodeAfter: null } } } } } as never,
    };
  }

  function chatGroupItem(label: string): SlashCommandItem {
    return {
      id: "agent-command:agent-1:" + label,
      label,
      description: "",
      group: { agentName: "Atlas", degraded: false, pending: false, runtimeId: "runtime-1" },
    };
  }

  it("inserts plain `/label ` text instead of a rich node, caret at the param position", () => {
    const { calls, editor } = chatRecordingEditor();
    const collapseToEnd = vi.fn();
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ collapseToEnd } as unknown as Selection);

    const config = createSlashCommandSuggestion(fakeQc({}), { getAgentCommandGroups: noopGetter });
    config.command!({ editor, range: { from: 0, to: 1 }, props: chatGroupItem("ship") } as never);

    expect(calls).toEqual([
      { from: 0, to: 1, content: [{ type: "text", text: "/ship " }] },
    ]);
    expect(collapseToEnd).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("inserts a long plugin-prefixed label verbatim", () => {
    const { calls, editor } = chatRecordingEditor();
    const spy = vi.spyOn(window, "getSelection").mockReturnValue({ collapseToEnd: vi.fn() } as unknown as Selection);

    const config = createSlashCommandSuggestion(fakeQc({}), { getAgentCommandGroups: noopGetter });
    config.command!({ editor, range: { from: 0, to: 33 }, props: chatGroupItem("oh-my-claudecode:deep-interview") } as never);

    expect(calls[0]?.content).toEqual([
      { type: "text", text: "/oh-my-claudecode:deep-interview " },
    ]);
    spy.mockRestore();
  });
});

describe("chat `/` menu — render props", () => {
  it("passes onRetryRuntimeSkills to the list component through the render props", () => {
    const onRetry = vi.fn();
    const config = createSlashCommandSuggestion(fakeQc({}), {
      getAgentCommandGroups: noopGetter,
      onRetryRuntimeSkills: onRetry,
    });

    const renderers = (config.render as unknown as () => {
      onStart: (props: { editor: unknown; clientRect: null }) => void;
      onExit: () => void;
    })();
    renderers.onStart({
      editor: { view: { dom: document.createElement("div") } },
      clientRect: null,
    });
    expect(rendererProps.captured).toEqual([
      expect.objectContaining({ onRetryRuntimeSkills: onRetry }),
    ]);
    renderers.onExit();
  });
});
