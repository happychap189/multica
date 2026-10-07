import type { AgentTask } from "@multica/core/types/agent";
import type { Comment } from "@multica/core/types/comment";
import type { Issue } from "@multica/core/types/issue";

import { PHASE_STAGE_COUNTS } from "../config/stages";
import { PHASES, type PhaseNumber } from "../config/phases";
import { isBacklogTrap } from "../config/red-lines";
import { canIntervene, type ReentryVerdict } from "../relay/reentry";
import { summarizeSlots, type SlotSummary } from "../relay/slots";
import {
  evaluateStall,
  type DaemonLiveness,
  type StallVerdict,
  type TaskLike,
} from "../relay/stall";
import { anchorOccurrencesFrom, newestCommentAt } from "../relay/timeline";
import type { ResolvedWorkspace } from "../api/client";

/**
 * Everything the panes render, derived fresh each tick.
 *
 * Nothing here is cached across ticks: the issue, the comment stream and the
 * task snapshot are the state, and every projection of them is recomputed. That
 * is what lets a cold start be correct with no local state at all.
 */

export interface RelayViewModel {
  readonly workspace: ResolvedWorkspace;
  readonly issue: {
    readonly id: string;
    readonly identifier: string;
    readonly title: string;
    readonly status: string;
    readonly assigneeType: string | null;
    readonly assigneeId: string | null;
    readonly revision: number | null;
  };
  readonly summary: SlotSummary;
  readonly stall: StallVerdict;
  /**
   * Whether the stall verdict means anything for this issue. False once the
   * relay is over: the arms still render (the numbers are informative) but a
   * finished issue is quiet by definition, not stalled.
   */
  readonly stallApplies: boolean;
  readonly reentry: ReentryVerdict;
  readonly daemonOnline: DaemonLiveness;
  /** Snapshot rows for this issue only. */
  readonly tasks: readonly AgentTask[];
  /** Ordered, most severe first. Empty means the timeline is healthy. */
  readonly alerts: readonly Alert[];
  readonly readOnly: boolean;
}

export interface Alert {
  readonly severity: "critical" | "warning" | "info";
  readonly message: string;
}

export interface ViewModelInput {
  readonly workspace: ResolvedWorkspace;
  readonly issue: Issue;
  readonly comments: readonly Comment[];
  readonly tasks: readonly AgentTask[];
  readonly readOnly: boolean;
  /** Epoch milliseconds; injected so this stays deterministic in tests. */
  readonly now: number;
}

/**
 * Daemon liveness is a §5.1 precondition, but the API surface this console uses
 * has no direct probe. The heuristic: a task in `dispatched`/`running` proves a
 * daemon is alive; silence proves nothing, so it stays `unknown` rather than
 * being asserted either way.
 */
function inferDaemonLiveness(tasks: readonly TaskLike[]): DaemonLiveness {
  return tasks.some((task) => task.status === "running" || task.status === "dispatched")
    ? true
    : "unknown";
}

export function buildViewModel(input: ViewModelInput): RelayViewModel {
  const occurrences = anchorOccurrencesFrom(input.comments);
  const summary = summarizeSlots(occurrences);
  const issueTasks = input.tasks.filter((task) => task.issue_id === input.issue.id);
  const daemonOnline = inferDaemonLiveness(issueTasks);

  const stall = evaluateStall({
    now: input.now,
    issueId: input.issue.id,
    lastCommentAt: newestCommentAt(input.comments),
    tasks: issueTasks,
    daemonOnline,
  });

  const reentry = canIntervene({
    issueId: input.issue.id,
    issueStatus: input.issue.status,
    lastAnchorReadable: summary.last !== null,
    tasks: issueTasks,
  });

  const alerts: Alert[] = [];
  if (isBacklogTrap(input.issue.status)) {
    alerts.push({
      severity: "critical",
      message: "issue is in BACKLOG — the pending-assignment trigger is frozen; restore todo",
    });
  }
  for (const anomaly of summary.anomalies) {
    alerts.push({ severity: "warning", message: anomaly });
  }
  for (const note of summary.notes) {
    alerts.push({ severity: "info", message: note });
  }
  if (reentry.reason === "terminal-issue") {
    // The arms still render (the numbers are informative), but a finished relay
    // is not a stall.
    alerts.push({ severity: "info", message: reentry.detail });
  } else if (stall.stalled) {
    alerts.push({
      severity: "critical",
      message: `STALL — ${stall.arms
        .filter((arm) => arm.active)
        .map((arm) => `arm${arm.id}`)
        .join(" + ")}${stall.interventionAllowed ? "" : " (daemon offline: restore it first)"}`,
    });
  }
  if (!reentry.allowed && reentry.reason === "active-task") {
    alerts.push({ severity: "info", message: reentry.detail });
  }

  return {
    workspace: input.workspace,
    issue: {
      id: input.issue.id,
      identifier: input.issue.identifier,
      title: input.issue.title,
      status: input.issue.status,
      assigneeType: input.issue.assignee_type,
      assigneeId: input.issue.assignee_id,
      revision: input.issue.revision ?? null,
    },
    summary,
    stall,
    stallApplies: reentry.reason !== "terminal-issue",
    reentry,
    daemonOnline,
    tasks: issueTasks,
    alerts,
    readOnly: input.readOnly,
  };
}

/** `filled/total` per phase, ready for the anchor pane. */
export function phaseProgress(summary: SlotSummary): readonly {
  phase: PhaseNumber;
  filled: number;
  total: number;
}[] {
  return PHASES.map(({ phase }) => ({
    phase,
    filled: summary.filledByPhase[phase],
    total: PHASE_STAGE_COUNTS[phase],
  }));
}
