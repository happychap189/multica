import { PHASE_SUMMARY_SLUG } from "../config/stages";
import type { PhaseNumber } from "../config/phases";
import { isBacklogTrap, isTerminalStatus } from "../config/red-lines";

import type { ReentryVerdict } from "./reentry";
import { isPhaseComplete, type SlotSummary } from "./slots";

/**
 * Idempotency predicates for the console's write actions.
 *
 * Each decision is derived from server state re-read just before acting — the
 * issue's assignee/status and the comment stream — never from a local ledger.
 * That is what makes a cold start safe: if the action was already performed
 * (by this console, by an earlier run, or by hand in the web UI), the predicate
 * says `noop` and no request is sent.
 *
 * `refuse` carries the reason the operator will see. Refusals that come from the
 * protocol's guards (the re-entry guard, a phase that is not complete, the
 * backlog trap) are prohibitions, not warnings.
 */

export type DecisionKind = "run" | "noop" | "refuse";

export type ActionStep = "reassign" | "mention" | "status";

export interface Decision {
  readonly kind: DecisionKind;
  readonly reason: string;
  /** Which sub-steps still need doing; empty for `noop` and `refuse`. */
  readonly steps: readonly ActionStep[];
}

export interface IssueSnapshot {
  readonly id: string;
  readonly status: string;
  readonly assignee_type: string | null;
  readonly assignee_id: string | null;
}

function refuse(reason: string): Decision {
  return { kind: "refuse", reason, steps: [] };
}

function run(steps: readonly ActionStep[], reason: string): Decision {
  return { kind: "run", reason, steps };
}

/** Guards shared by every forward action. Returns a refusal, or null when clear. */
function commonRefusals(issue: IssueSnapshot, reentry: ReentryVerdict): Decision | null {
  if (isBacklogTrap(issue.status)) {
    return refuse(
      "issue is in backlog — the pending-assignment trigger is frozen; restore todo first",
    );
  }
  if (isTerminalStatus(issue.status)) {
    return refuse(`issue is ${issue.status}; no forward action applies`);
  }
  if (!reentry.allowed) return refuse(reentry.detail);
  return null;
}

export interface HandoffInput {
  readonly fromPhase: PhaseNumber;
  readonly issue: IssueSnapshot;
  readonly summary: SlotSummary;
  readonly reentry: ReentryVerdict;
  /** The next phase's human owner (team member id), not a squad. */
  readonly targetOwnerId: string;
  /** A comment after the last anchor already mentions the next squad. */
  readonly alreadyMentionedNextSquad: boolean;
}

/** Handoff P_k → P_{k+1}: reassign the owner, then mention the next squad. */
export function handoffDecision(input: HandoffInput): Decision {
  const blocked = commonRefusals(input.issue, input.reentry);
  if (blocked) return blocked;

  if (!isPhaseComplete(input.summary, input.fromPhase)) {
    const filled = input.summary.filledByPhase[input.fromPhase];
    return refuse(
      `phase ${input.fromPhase} has ${filled} filled slot(s) — a handoff needs the phase complete`,
    );
  }
  const last = input.summary.last?.anchor;
  if (!last || last.phase !== input.fromPhase || last.next !== PHASE_SUMMARY_SLUG) {
    return refuse(
      `the last anchor is not phase ${input.fromPhase}'s final anchor (got P${last?.phase ?? "?"} → ${last?.next ?? "none"})`,
    );
  }

  const steps: ActionStep[] = [];
  const assignedToTarget =
    input.issue.assignee_type === "member" && input.issue.assignee_id === input.targetOwnerId;
  if (!assignedToTarget) steps.push("reassign");
  if (!input.alreadyMentionedNextSquad) steps.push("mention");

  if (steps.length === 0) {
    return { kind: "noop", reason: "owner already reassigned and the next squad already mentioned", steps: [] };
  }
  return run(steps, `handoff phase ${input.fromPhase} → ${input.fromPhase + 1}`);
}

export interface TerminalReassignInput {
  readonly issue: IssueSnapshot;
  readonly summary: SlotSummary;
  readonly reentry: ReentryVerdict;
  /** The P5 squad id — the only time an issue's assignee is a squad. */
  readonly squadId: string;
  /** The operator has ticked the P5 review checklist. */
  readonly checklistTicked: boolean;
  /** The P5 phase summary comment is present on the timeline. */
  readonly phaseSummaryPresent: boolean;
}

/** Terminal two-stage, step 1: hand the issue to the final squad (§3.10). */
export function terminalReassignDecision(input: TerminalReassignInput): Decision {
  const blocked = commonRefusals(input.issue, input.reentry);
  if (blocked) return blocked;

  if (!isPhaseComplete(input.summary, 5)) {
    return refuse("phase 5 is not complete — the final squad is handed an unfinished phase");
  }
  if (!input.phaseSummaryPresent) {
    return refuse("the phase 5 summary comment is missing");
  }
  if (!input.checklistTicked) {
    return refuse("tick the P5 review checklist before handing the issue to the squad");
  }

  if (input.issue.assignee_type === "squad" && input.issue.assignee_id === input.squadId) {
    return { kind: "noop", reason: "issue already assigned to the final squad", steps: [] };
  }
  return run(["reassign"], "hand the issue to the final squad (in_review close-out authority)");
}

export interface FinalDoneInput {
  readonly issue: IssueSnapshot;
  /** The leader's close-out comment is present. */
  readonly leaderCloseOutPresent: boolean;
  readonly checklistTicked: boolean;
}

/** Terminal two-stage, step 3: the human writes `done` (§3.10, §6.1). */
export function finalDoneDecision(input: FinalDoneInput): Decision {
  if (input.issue.status === "done") {
    return { kind: "noop", reason: "issue is already done", steps: [] };
  }
  if (input.issue.status !== "in_review") {
    return refuse(
      `done is written only from in_review (current: ${input.issue.status}) — the squad closes the issue first`,
    );
  }
  if (input.issue.assignee_type !== "squad") {
    return refuse("the issue is not held by the final squad; run the terminal reassign first");
  }
  if (!input.leaderCloseOutPresent) {
    return refuse("no squad close-out comment found on the timeline");
  }
  if (!input.checklistTicked) {
    return refuse("tick the terminal checklist before closing the relay");
  }
  return run(["status"], "close the relay — human-only terminal action");
}
