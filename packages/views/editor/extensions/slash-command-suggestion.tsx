"use client";

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SuggestionOptions } from "@tiptap/suggestion";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import { useAuthStore } from "@multica/core/auth";
import { useChatStore } from "@multica/core/chat";
import type { AgentCommandGroup } from "@multica/core/agents";
import { getCurrentWsId } from "@multica/core/platform";
import { canAssignAgentToIssue } from "@multica/core/permissions";
import { isImeComposing } from "@multica/core/utils";
import { workspaceKeys } from "@multica/core/workspace/queries";
import type { Agent, MemberWithUser } from "@multica/core/types";
import { useT } from "../../i18n";
import {
  createSuggestionPopupRender,
} from "./suggestion-popup";
import {
  isPickerAcceptKey,
  pickerNavigationDirection,
} from "../../common/picker-keys";
import { isTriggerArmedAt } from "./suggestion-trigger-arming";
import { matchesPinyin } from "./pinyin-match";

const MAX_ITEMS = 20;

/** Known built-in command ids — the keys under editor `slash_command.commands`. */
export type BuiltinCommandKey = "note";

/** Marks a menu entry as contributed by an agent command group. */
export const AGENT_COMMAND_ITEM_PREFIX = "agent-command:";

export interface SlashCommandItem {
  id: string;
  label: string;
  /** Raw description (skill picker). Built-in commands use descriptionKey. */
  description?: string;
  /**
   * For built-in commands: the i18n key under editor `slash_command.commands`.
   * When set, the menu renders the translated copy instead of `description`,
   * so the visible string stays localized (the typed `/label` does not).
   */
  descriptionKey?: BuiltinCommandKey;
  /**
   * Set on entries contributed by an agent command group (issue comments and
   * chat): the agent whose mounted/runtime skills produced this entry, so the
   * list can draw a header when the group changes. Built-ins and quick
   * actions never carry it — its absence is what keeps those menus exactly as
   * they were before this change.
   */
  group?: {
    agentName: string;
    degraded: boolean;
    pending: boolean;
    runtimeId: string;
  };
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  query: string;
  command: (item: SlashCommandItem) => void;
  /**
   * When true, render nothing instead of an empty-state box when there are no
   * matching items. Used by the built-in command menu in issue comments, where
   * `/` is common in prose (paths, dates) and a popup on every slash would be
   * noise. The chat skill picker leaves this false so it can still explain
   * "no skills configured".
   */
  hideOnEmpty?: boolean;
  /**
   * Retry trigger for degraded agent command groups (comment composer and
   * chat). The control lives in the group header row, outside the navigable
   * items, so passing it never changes keyboard semantics.
   */
  onRetryRuntimeSkills?: (runtimeId: string) => void;
}

export interface SlashCommandListRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashCommandList = forwardRef<
  SlashCommandListRef,
  SlashCommandListProps
>(function SlashCommandList(
  { items, query, command, hideOnEmpty = false, onRetryRuntimeSkills },
  ref,
) {
  const { t } = useT("editor");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const selectItem = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      command(item);
    },
    [items, command],
  );

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (isImeComposing(event)) return false;
      // Arrow keys plus the Ctrl+N/J/P/K aliases the command bar accepts —
      // see pickerNavigationDirection.
      const direction = pickerNavigationDirection(event);
      if (direction !== null) {
        if (items.length === 0) return false;
        const delta = direction === "next" ? 1 : items.length - 1;
        setSelectedIndex((i) => (i + delta) % items.length);
        return true;
      }
      // Enter is the canonical accept; plain Tab is an additive alias (see
      // isPickerAcceptKey). Shift/modifier+Tab fall through to focus nav.
      if (isPickerAcceptKey(event)) {
        if (items.length === 0) return false;
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    if (hideOnEmpty) return null;
    return (
      <div className="rounded-md border bg-popover p-2 text-caption text-muted-foreground shadow-md">
        {t(($) =>
          query.trim()
            ? $.slash_command.no_results
            : $.slash_command.no_skills_configured,
        )}
      </div>
    );
  }

  // Built-in commands carry an i18n key so the visible description stays
  // localized; skills carry a raw description string from their config.
  const describe = (item: SlashCommandItem): string | undefined =>
    item.descriptionKey === "note"
      ? t(($) => $.slash_command.commands.note)
      : item.description;

  return (
    // Height budget clamps to min(design max, viewport-aware
    // `--suggestion-available-height` from suggestion-popup.tsx's size
    // middleware), falling back to the design max when rendered standalone.
    // Single height authority — mirrors MentionList.
    <div className="rounded-md border bg-popover py-1 shadow-md w-72 max-h-[min(300px,var(--suggestion-available-height,300px))] overflow-y-auto">
      {items.map((item, index) => {
        const description = describe(item);
        // Group headers render when the group reference changes between
        // adjacent items; the composition (buildAgentGroupMenuItems) shares
        // one metadata object per group, so reference equality is exact.
        // Headers are non-interactive rows between the flat item buttons —
        // itemRefs/selectedIndex never count them, so keyboard nav is
        // unchanged.
        const groupStart =
          item.group && items[index - 1]?.group !== item.group;
        return (
          <Fragment key={item.id}>
            {groupStart && item.group && (
              <AgentGroupHeader
                group={item.group}
                onRetryRuntimeSkills={onRetryRuntimeSkills}
              />
            )}
            <button
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
            className={`flex w-full flex-col gap-0.5 px-3 py-1.5 text-left text-caption transition-colors ${
              selectedIndex === index ? "bg-accent" : "hover:bg-accent/50"
            }`}
            onClick={() => selectItem(index)}
          >
            <span className="font-medium">/{item.label}</span>
            {description && (
              <span className="truncate text-muted-foreground">
                {description}
              </span>
            )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
});

/**
 * Non-interactive header row for an agent command group: the agent name plus
 * the group's state. Pending shows a light loading note; degraded shows the
 * unavailable notice plus an inline retry control. The retry button lives in
 * the header row, not an item, so it cannot shift keyboard navigation, and
 * its click is stopped from bubbling as an item pick.
 */
function AgentGroupHeader({
  group,
  onRetryRuntimeSkills,
}: {
  group: NonNullable<SlashCommandItem["group"]>;
  onRetryRuntimeSkills?: (runtimeId: string) => void;
}) {
  const { t } = useT("editor");
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 pt-2 pb-1 text-caption text-muted-foreground"
      title={t(($) => $.slash_command.command_source_help)}
    >
      <span className="min-w-0 truncate font-medium">{group.agentName}</span>
      {group.pending && (
        <span aria-live="polite">
          {t(($) => $.slash_command.runtime_skills_pending)}
        </span>
      )}
      {group.degraded && !group.pending && (
        <span className="flex shrink-0 items-center gap-1">
          <span>{t(($) => $.slash_command.runtime_skills_unavailable)}</span>
          <button
            type="button"
            aria-label={t(($) => $.slash_command.retry_runtime_skills)}
            className="shrink-0 rounded p-0.5 text-caption underline hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation();
              onRetryRuntimeSkills?.(group.runtimeId);
            }}
          >
            {t(($) => $.slash_command.retry_runtime_skills)}
          </button>
        </span>
      )}
    </div>
  );
}

/**
 * Resolves the agent whose command catalog the chat `/` menu lists: the
 * chat-selected agent, falling back to the first available one. Availability
 * matches the pre-catalog chat picker exactly — not archived and invocable by
 * the current viewer (`canAssignAgentToIssue`) — and reads the Query caches
 * directly, because Tiptap calls suggestion items outside React render. The
 * getter (useAgentSlashCommands) applies the stricter catalog gate on top, so
 * a selection that is not runtime-bound simply yields an empty menu.
 */
function resolveChatSlashAgent(qc: QueryClient): Agent | null {
  const wsId = getCurrentWsId();
  if (!wsId) return null;

  const agents: Agent[] = qc.getQueryData(workspaceKeys.agents(wsId)) ?? [];
  const members: MemberWithUser[] =
    qc.getQueryData(workspaceKeys.members(wsId)) ?? [];
  // Tiptap calls suggestion items outside React render, so direct store reads
  // are intentional here.
  const { selectedAgentId } = useChatStore.getState();
  const userId = useAuthStore.getState().user?.id ?? null;
  const memberRole = members.find((m) => m.user_id === userId)?.role ?? null;

  const availableAgents = agents.filter(
    (a) =>
      !a.archived_at &&
      canAssignAgentToIssue(a, { userId, role: memberRole }).allowed,
  );
  return (
    availableAgents.find((a) => a.id === selectedAgentId) ??
    availableAgents[0] ??
    null
  );
}

export interface SlashCommandSuggestionOptions {
  /**
   * Agent command groups behind the chat `/` menu (mounted + runtime skills,
   * joined by the core catalog). Resolved for the chat-selected agent — the
   * items callback passes that single id. Absent, the menu is empty and
   * renders the standard "no skills configured" state.
   */
  getAgentCommandGroups?: (agentIds: string[]) => AgentCommandGroup[];
  /** Fired by a degraded group header's retry control (see useAgentSlashCommands). */
  onRetryRuntimeSkills?: (runtimeId: string) => void;
}

export function createSlashCommandSuggestion(
  qc: QueryClient,
  options: SlashCommandSuggestionOptions = {},
): Omit<SuggestionOptions<SlashCommandItem>, "editor"> {
  const pluginKey = new PluginKey("slashCommandSuggestion");

  return {
    char: "/",
    pluginKey,
    // Only open over a `/` the user actually typed, so a pasted path
    // (`/usr/local/bin`) never opens the command menu (MUL-5429).
    shouldShow: ({ editor, range }) => isTriggerArmedAt(editor, range.from),
    items: ({ query }) => {
      const getGroups = options.getAgentCommandGroups;
      if (!getGroups) return [];
      const agent = resolveChatSlashAgent(qc);
      if (!agent) return [];
      // Chat has no built-ins ahead of the group, so the truncation budget is
      // the whole menu; group headers, degraded, pending, and retry all render
      // through the same SlashCommandList machinery the comment composer uses.
      return buildAgentGroupMenuItems(getGroups([agent.id]), query, 0);
    },
    command: ({ editor, range, props }) => {
      const nodeAfter = editor.view.state.selection.$to.nodeAfter;
      const overrideSpace = nodeAfter?.text?.startsWith(" ");
      if (overrideSpace) {
        range.to += 1;
      }

      // Plain text `/label ` — byte-identical to hand-typing and to the
      // comment composer's agent command insertion. The trailing space
      // terminates the suggestion match so the menu does not re-open and
      // leaves the caret at the parameter position; the label is inserted
      // verbatim, including `plugin:` prefixes. The slashCommand rich node
      // stays registered only to render history — new picks never create one.
      editor
        .chain()
        .focus()
        .insertContentAt(range, [{ type: "text", text: `/${props.label} ` }])
        .run();

      window.getSelection()?.collapseToEnd();
    },
    render: createSuggestionPopupRender<SlashCommandItem, SlashCommandItem, SlashCommandListRef, SlashCommandListProps>({
      pluginKey,
      component: SlashCommandList,
      getProps: (props) => ({
        items: props.items,
        query: props.query,
        command: props.command,
        onRetryRuntimeSkills: options.onRetryRuntimeSkills,
      }),
      onKeyDown: (ref, props) => ref?.onKeyDown(props) ?? false,
    }),
  };
}

// ---------------------------------------------------------------------------
// Built-in command menu (issue comments)
// ---------------------------------------------------------------------------

/**
 * Built-in slash commands offered in the issue comment composer. Unlike the
 * chat `/` picker (which lists the active agent's command catalog), these are
 * a fixed, hand-curated set. Currently only `/note`, which marks a comment as
 * a human-only note that won't trigger the assigned agent — mirrors the backend
 * `noteCommentPrefix` in server/internal/handler/comment.go.
 */
export const BUILTIN_COMMANDS: SlashCommandItem[] = [
  { id: "note", label: "note", descriptionKey: "note" },
];

/** Marks a menu entry as a configured quick action rather than a built-in. */
export const QUICK_ACTION_ITEM_PREFIX = "quick-action:";

export function isQuickActionItem(item: SlashCommandItem): boolean {
  return item.id.startsWith(QUICK_ACTION_ITEM_PREFIX);
}

export function quickActionIdFromItem(item: SlashCommandItem): string {
  return item.id.slice(QUICK_ACTION_ITEM_PREFIX.length);
}

// Match on the command label as a prefix only — the description is for display,
// not search. With a single command this keeps the menu predictable (typing
// `/no` surfaces `note`; an unrelated `/deploy` shows nothing).
export function buildBuiltinCommandItems(
  query: string,
  quickActions: { id: string; name: string; description?: string }[] = [],
): SlashCommandItem[] {
  const q = query.toLowerCase();
  // Quick actions lead: on an issue they are the reason a user reaches for
  // `/`, and `/note` is a rarely-used escape hatch.
  const actionItems: SlashCommandItem[] = quickActions.map((a) => ({
    id: `${QUICK_ACTION_ITEM_PREFIX}${a.id}`,
    label: a.name,
    description: a.description || undefined,
  }));
  return [...actionItems, ...BUILTIN_COMMANDS]
    .filter((c) => c.label.toLowerCase().startsWith(q))
    .slice(0, MAX_ITEMS);
}

/**
 * Scan the document for mentioned-agent ids, in document order, deduped. The
 * items callback runs outside React (same reason the chat picker reads the
 * stores directly), so it scans the doc directly instead of subscribing to
 * draft state.
 */
export function mentionedAgentIdsFromDoc(
  doc: ProseMirrorNode | undefined | null,
): string[] {
  const ids: string[] = [];
  doc?.descendants((node) => {
    if (node.type.name !== "mention" || node.attrs.type !== "agent") return;
    const id = node.attrs.id;
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

// The agentCommandMatchRank ladder over label/description, then a pinyin tier
// below raw-text matches —
// the mention menu matches pinyin on name and description
// (mention-suggestion.tsx matchesMentionQuery), so a Chinese skill
// description must be findable by pinyin here too.
const PINYIN_MATCH = 4;
const AGENT_COMMAND_NO_MATCH = 5;

/** Match tiers for an agent command entry: the skillMatchRank ladder over
 *  the label, then description, then pinyin on either. */
function agentCommandMatchRank(
  entry: { label: string; description?: string },
  q: string,
): number {
  const label = entry.label.toLowerCase();
  if (label === q) return 0;
  if (label.startsWith(q)) return 1;
  if (label.includes(q)) return 2;
  if ((entry.description ?? "").toLowerCase().includes(q)) return 3;
  if (
    matchesPinyin(entry.label, q) ||
    (entry.description ? matchesPinyin(entry.description, q) : false)
  ) {
    return PINYIN_MATCH;
  }
  return AGENT_COMMAND_NO_MATCH;
}

/**
 * Same shape as rankSkillMatches: filter + tier-sort that preserves
 * configured order within a tier.
 */
function rankAgentCommandEntries<T extends { label: string; description?: string }>(
  entries: T[],
  q: string,
): T[] {
  if (!q) return entries;
  return entries
    .map((entry) => ({ entry, rank: agentCommandMatchRank(entry, q) }))
    .filter((e) => e.rank !== AGENT_COMMAND_NO_MATCH)
    .sort((a, b) => a.rank - b.rank)
    .map((e) => e.entry);
}

/**
 * Menu entries for the agent command groups, appended after the built-ins.
 *
 * Truncation is a budget, not a hard cap (MAX_ITEMS): pass 1 guarantees every
 * group's top-ranked entry a slot even when the quick-action list is full —
 * which can push the total past the budget — and pass 2 fills the remaining
 * budget (MAX_ITEMS minus built-ins minus guarantees, floored at 0)
 * round-robin across the groups in group order, one entry per group per
 * round, until the budget or the groups are exhausted. No second-mentioned
 * agent's group can be starved. Built-ins keep their own internal slice;
 * with no agent mentions the menu never reaches this function.
 */
export function buildAgentGroupMenuItems(
  groups: AgentCommandGroup[],
  query: string,
  builtinCount: number,
): SlashCommandItem[] {
  const q = query.toLowerCase();
  const filtered = groups
    .map((group) => ({
      group,
      items: rankAgentCommandEntries(group.items, q),
    }))
    // A group whose entries all fail the query drops out entirely — its
    // header disappears with it rather than floating above another group's
    // items.
    .filter((g) => g.items.length > 0);

  // Map the ranked entries to menu items up front; truncation below only
  // decides HOW MANY survive per group. One shared metadata object per group
  // — the list detects a header boundary by reference equality between
  // adjacent items.
  const perGroup: SlashCommandItem[][] = filtered.map(({ group, items }) => {
    // One metadata object SHARED by every item of the group: the list
    // detects a header boundary by reference equality between adjacent
    // items, so per-item literals would draw a header before each entry.
    const meta = {
      agentName: group.agentName,
      degraded: group.degraded,
      pending: group.pending ?? false,
      runtimeId: group.runtimeId,
    };
    return items.map((entry) => ({
      id: `${AGENT_COMMAND_ITEM_PREFIX}${group.agentId}:${entry.id}`,
      label: entry.label,
      description: entry.description ?? "",
      group: meta,
    }));
  });

  // Pass 1 — every surviving group's top-ranked entry is guaranteed a slot,
  // even when the built-in list is full (so the total may exceed MAX_ITEMS).
  // Pass 2 — the remaining budget (MAX_ITEMS minus built-ins minus one per
  // group, floored at 0) fills the groups round-robin in group order, one
  // entry per group per round, until budget or groups are exhausted.
  const kept: SlashCommandItem[][] = perGroup.map((items) => items.slice(0, 1));
  const queues: SlashCommandItem[][] = perGroup.map((items) => items.slice(1));
  let budget = Math.max(0, MAX_ITEMS - builtinCount - perGroup.length);
  while (budget > 0) {
    let anyTaken = false;
    for (let i = 0; i < queues.length && budget > 0; i++) {
      const next = queues[i]?.shift();
      if (!next) continue; // group exhausted
      kept[i]?.push(next);
      budget -= 1;
      anyTaken = true;
    }
    if (!anyTaken) break; // every group exhausted
  }
  return kept.flat();
}

export interface BuiltinCommandSuggestionOptions {
  /**
   * Configured quick actions offered alongside the built-ins. Read lazily on
   * every keystroke so a newly created action shows up without remounting the
   * editor.
   */
  getQuickActions?: () => { id: string; name: string; description?: string }[];
  /**
   * Resolves a quick action to the text it would post. Server-rendered, so the
   * inserted body is byte-identical to what clicking the sidebar button sends.
   * Returning "" (or throwing) must leave the composer untouched rather than
   * inserting a half-rendered prompt.
   */
  renderQuickAction?: (quickActionId: string) => Promise<string>;
  /**
   * Called when renderQuickAction rejects. The extension cannot show UI of its
   * own — a ProseMirror command runs outside React's tree — so the host turns
   * this into a toast. Without it a failed pick is completely silent.
   */
  onRenderError?: (error: unknown) => void;
  /**
   * Agent command groups for the `/` menu. Called with the agent ids the
   * document mentions (comment composer) or the chat-selected agent id
   * (chat); groups render after the built-ins under per-agent headers.
   * Absent (a composer that opts out) the menu is byte-identical to the
   * pre-grouping behavior.
   */
  getAgentCommandGroups?: (mentionedAgentIds: string[]) => AgentCommandGroup[];
  /**
   * Fired by a degraded group header's retry control; re-runs the runtime
   * skill enumeration for that runtime.
   */
  onRetryRuntimeSkills?: (runtimeId: string) => void;
}

/**
 * What ContentEditor takes as `agentCommandMenu` and hands to
 * createBuiltinCommandSuggestion — the same two members, non-optional, so a
 * wired composer cannot forget one.
 */
export interface AgentCommandMenuOptions {
  getAgentCommandGroups: (mentionedAgentIds: string[]) => AgentCommandGroup[];
  retryRuntimeSkills: (runtimeId: string) => void;
}

export function createBuiltinCommandSuggestion(
  options: BuiltinCommandSuggestionOptions = {},
): Omit<SuggestionOptions<SlashCommandItem>, "editor"> {
  const pluginKey = new PluginKey("builtinCommandSuggestion");

  return {
    char: "/",
    pluginKey,
    // Only open over a `/` the user actually typed, so a pasted path
    // (`/usr/local/bin`) never opens the command menu (MUL-5429).
    shouldShow: ({ editor, range }) => isTriggerArmedAt(editor, range.from),
    items: ({ editor, query }) => {
      // Built-ins first, exactly as before; grouping only ever APPENDS.
      const builtins = buildBuiltinCommandItems(
        query,
        options.getQuickActions?.() ?? [],
      );
      const getGroups = options.getAgentCommandGroups;
      if (!getGroups) return builtins;
      const mentioned = mentionedAgentIdsFromDoc(editor?.state?.doc);
      if (mentioned.length === 0) return builtins;
      return [
        ...builtins,
        ...buildAgentGroupMenuItems(getGroups(mentioned), query, builtins.length),
      ];
    },
    command: ({ editor, range, props }) => {
      if (isQuickActionItem(props)) {
        const render = options.renderQuickAction;
        if (!render) return;
        const id = quickActionIdFromItem(props);

        // The "/query" text is deliberately left in place while the request
        // is in flight. Deleting first meant a failed or slow render destroyed
        // what the user typed with nothing to show for it, and the insert then
        // landed wherever the caret happened to be by the time it resolved.
        //
        // Snapshot the EXACT text under the range, not just its shape. A
        // prefix check ("does it still start with /") passes when the user
        // rewrote `/review` into `/fix` mid-request, and the stale response
        // would then overwrite the new command.
        const originalText = editor.state.doc.textBetween(range.from, range.to);

        void render(id)
          .then((content) => {
            if (!content) return;
            const withinDoc = range.to <= editor.state.doc.content.size;
            const unchanged =
              withinDoc && editor.state.doc.textBetween(range.from, range.to) === originalText;
            if (!unchanged) {
              // The command was edited, moved, or removed while the request
              // was outstanding. Inserting anywhere now would either clobber
              // the user's newer text or drop the body in an unrelated spot,
              // so this pick is simply abandoned.
              return;
            }
            editor
              .chain()
              .focus()
              // contentType: "markdown" is load-bearing. Without it Tiptap
              // inserts the string as literal TEXT, so the server-rendered
              // `[@Name](mention://agent/…)` never becomes a mention node —
              // it serialises back out with the brackets escaped
              // (`\[@Name\](…)`) and renders as raw markup in the thread.
              .insertContentAt({ from: range.from, to: range.to }, content, {
                contentType: "markdown",
              })
              .run();
            window.getSelection()?.collapseToEnd();
          })
          .catch((error: unknown) => {
            // The command text is still there, so the user can retry or edit
            // it by hand; the host surfaces why nothing was inserted.
            options.onRenderError?.(error);
          });
        return;
      }

      // Insert the plain-text prefix (e.g. "/note ") rather than a rich node,
      // so a menu selection and a hand-typed command are byte-identical and the
      // backend can detect the marker with a simple prefix match. The trailing
      // space terminates the suggestion match so the menu does not re-open.
      // Agent command entries (item.group set) land here too: the label is
      // inserted verbatim — including `plugin:` prefixes — and the trailing
      // space leaves the caret at the parameter position.
      editor
        .chain()
        .focus()
        .insertContentAt(range, [{ type: "text", text: `/${props.label} ` }])
        .run();

      window.getSelection()?.collapseToEnd();
    },
    render: createSuggestionPopupRender<SlashCommandItem, SlashCommandItem, SlashCommandListRef, SlashCommandListProps>({
      pluginKey,
      component: SlashCommandList,
      getProps: (props) => ({
        items: props.items,
        query: props.query,
        command: props.command,
        hideOnEmpty: true,
        onRetryRuntimeSkills: options.onRetryRuntimeSkills,
      }),
      onKeyDown: (ref, props) => ref?.onKeyDown(props) ?? false,
    }),
  };
}
