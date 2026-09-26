"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  buildAgentCommandCatalog,
  isAgentRuntimeBound,
  type AgentCommandGroup,
} from "@multica/core/agents";
import { canAssignAgentToIssue } from "@multica/core/permissions";
import type { PermissionContext } from "@multica/core/permissions";
import {
  runtimeCapabilitiesOptions,
  runtimeLocalSkillsKeys,
} from "@multica/core/runtimes";
import { workspaceKeys } from "@multica/core/workspace/queries";
import { useCurrentWorkspace } from "@multica/core/paths";
import { useAuthStore } from "@multica/core/auth";
import type {
  Agent,
  MemberWithUser,
  RuntimeLocalSkillSummary,
} from "@multica/core/types";

// Mount prewarm stops here; beyond the cap a runtime's enumeration only starts
// when one of its agents is first mentioned (lazy supplement below). Eight
// covers every runtime a workspace realistically mentions while keeping the
// composer's worst-case burst bounded.
const MAX_PREWARM_RUNTIMES = 8;

/**
 * The single availability gate for the composer's agent command groups — both
 * the mount prewarm and the keystroke getter filter through it, so the two
 * paths can never disagree about which agents get a group. Matches the chat
 * side's availability gate (resolveChatSlashAgent in
 * slash-command-suggestion.tsx) plus the runtime-bound requirement.
 */
function agentQualifies(agent: Agent, ctx: PermissionContext): boolean {
  return (
    !agent.archived_at &&
    isAgentRuntimeBound(agent) &&
    canAssignAgentToIssue(agent, ctx).allowed
  );
}

/**
 * Reads the chat side's PermissionContext the same way resolveChatSlashAgent
 * does: the auth user plus the viewer's role in the workspace members cache.
 */
function permissionContextFromCache(
  qc: QueryClient,
  wsId: string,
): PermissionContext {
  const userId = useAuthStore.getState().user?.id ?? null;
  const members: MemberWithUser[] =
    qc.getQueryData(workspaceKeys.members(wsId)) ?? [];
  const role = members.find((m) => m.user_id === userId)?.role ?? null;
  return { userId, role };
}

/**
 * Starts (or reuses) one runtime enumeration. fire-and-forget: `revalidateIfStale`
 * makes the ensure re-fetch in the background once data is older than
 * staleTime, so a reopened composer refreshes instead of pinning an old
 * enumeration (AC-9). A failure lands in the query's error state — the getter
 * flags the group degraded from there — so the promise only needs its
 * rejection silenced.
 */
function prewarmRuntime(qc: QueryClient, runtimeId: string) {
  void qc
    .ensureQueryData({
      ...runtimeCapabilitiesOptions(runtimeId),
      revalidateIfStale: true,
    })
    .catch(() => undefined);
}

/**
 * Prewarms the runtime skill enumerations (source C) behind the comment
 * composer's agent command groups and hands the `/` menu a synchronous cache
 * reader for them (the TipTap items callback runs outside React, so it cannot
 * use hooks — it reads the Query cache directly instead).
 *
 * Server data stays owned by TanStack Query; this hook defines no store. Like
 * `useQuickActionMenu`, it reads workspace identity through
 * `useCurrentWorkspace` (nullable) so an enhancement can never take the
 * composer down outside a workspace route.
 */
export function useAgentSlashCommands() {
  const workspace = useCurrentWorkspace();
  const wsId = workspace?.id ?? "";
  const qc = useQueryClient();

  // Runtimes this composer instance already started enumerating. Keeps the
  // lazy mention-driven supplement one-shot per runtime so a keystroke never
  // triggers a second enumeration request.
  const prewarmedRef = useRef<Set<string>>(new Set<string>());

  // Prewarm on mount: enumerate the runtimes behind every qualifying agent so
  // the first `/` keystroke finds source C cached. fire-and-forget —
  // ensureQueryData no-ops while data is fresh, so remounting the composer
  // inside staleTime sends no new requests (AC-9).
  useEffect(() => {
    if (wsId === "") return;
    const agents: Agent[] = qc.getQueryData(workspaceKeys.agents(wsId)) ?? [];
    const ctx = permissionContextFromCache(qc, wsId);
    const runtimeIds = [
      ...new Set(
        agents
          .filter((agent) => agentQualifies(agent, ctx))
          .map((agent) => agent.runtime_id),
      ),
    ];
    for (const runtimeId of runtimeIds.slice(0, MAX_PREWARM_RUNTIMES)) {
      prewarmedRef.current.add(runtimeId);
      prewarmRuntime(qc, runtimeId);
    }
  }, [qc, wsId]);

  // The getter runs on every keystroke outside React's tree. Reading through
  // a ref keeps its identity stable (the editor freezes the function it
  // captures at mount), while every call re-reads the live cache.
  const getterRef = useRef<(mentionedAgentIds: string[]) => AgentCommandGroup[]>(
    () => [],
  );
  getterRef.current = (mentionedAgentIds: string[]) => {
    if (wsId === "" || mentionedAgentIds.length === 0) return [];

    const agents: Agent[] = qc.getQueryData(workspaceKeys.agents(wsId)) ?? [];
    const ctx = permissionContextFromCache(qc, wsId);
    const mentioned = mentionedAgentIds
      .map((id) => agents.find((agent) => agent.id === id))
      .filter((agent): agent is Agent => agent !== undefined)
      .filter((agent) => agentQualifies(agent, ctx));

    // First encounter of an unwarmed runtime loads it now (the lazy
    // supplement to the capped mount prewarm). fire-and-forget: the group
    // emits from whatever is cached today and the next keystroke sees the
    // result.
    for (const agent of mentioned) {
      if (!prewarmedRef.current.has(agent.runtime_id)) {
        prewarmedRef.current.add(agent.runtime_id);
        prewarmRuntime(qc, agent.runtime_id);
      }
    }

    // Source C per runtime. The query data is the two-part result of
    // resolveRuntimeLocalSkills ({ skills, supported, mcpServers, ... }) —
    // unwrap `.skills`.
    const runtimeSkillsByRuntime = new Map<
      string,
      RuntimeLocalSkillSummary[]
    >();
    for (const agent of mentioned) {
      if (runtimeSkillsByRuntime.has(agent.runtime_id)) continue;
      const data = qc.getQueryData<{ skills?: RuntimeLocalSkillSummary[] }>(
        runtimeLocalSkillsKeys.forRuntime(agent.runtime_id),
      );
      if (data?.skills !== undefined) {
        runtimeSkillsByRuntime.set(agent.runtime_id, data.skills);
      }
    }

    const groups = buildAgentCommandCatalog({
      agents: mentioned,
      runtimeSkillsByRuntime,
    });

    // Per-runtime query state drives the header signals the menu renders: an
    // errored enumeration keeps the group visible but flagged degraded
    // (mounted items still emit), while a pending one shows a loading state
    // instead of an ambiguous empty group.
    const byId = new Map(mentioned.map((agent) => [agent.id, agent]));
    for (const group of groups) {
      const agent = byId.get(group.agentId);
      if (!agent) continue;
      const state = qc.getQueryState(
        runtimeLocalSkillsKeys.forRuntime(agent.runtime_id),
      );
      if (state?.status === "error") group.degraded = true;
      if (state?.status === "pending") group.pending = true;
    }
    return groups;
  };

  const getAgentCommandGroups = useCallback(
    (mentionedAgentIds: string[]) => getterRef.current(mentionedAgentIds),
    [],
  );

  // Degraded group headers (wired in the menu) call this to re-run the
  // enumeration; with `retry: false` on the query it is the only self-heal
  // path for a long-lived composer.
  const retryRuntimeSkills = useCallback(
    (runtimeId: string) => {
      prewarmRuntime(qc, runtimeId);
    },
    [qc],
  );

  return useMemo(
    () => ({ getAgentCommandGroups, retryRuntimeSkills }),
    [getAgentCommandGroups, retryRuntimeSkills],
  );
}
