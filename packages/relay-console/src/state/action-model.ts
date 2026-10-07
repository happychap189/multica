import type { MentionTarget } from "../relay/mentions";
import { buildMentionLiteral } from "../relay/mentions";
import {
  finalDoneDecision,
  handoffDecision,
  terminalReassignDecision,
  type Decision,
  type IssueSnapshot,
} from "../relay/idempotency";
import type { ReentryVerdict } from "../relay/reentry";
import type { SlotSummary } from "../relay/slots";
import type { PhaseNumber } from "../config/phases";

/**
 * Turns a decision into something the operator can inspect before it happens.
 *
 * A preview is the exact wire traffic — method, path and body — plus the exact
 * comment bytes. It is computed from the same inputs the decision used, so what
 * is shown is what would be sent; nothing is reconstructed for display.
 *
 * Mentions are always built by `buildMentionLiteral` from an id that came out of
 * the roster. Hand-written ids are the protocol's most expensive failure: a
 * plausible-looking wrong uuid is accepted with HTTP 201 and then dropped
 * silently.
 */

export type ActionKind = "handoff" | "terminal-reassign" | "final-done";

export interface PreviewRequest {
  readonly method: "PUT" | "POST";
  readonly path: string;
  readonly body: string;
}

/**
 * What the runner will actually call.
 *
 * Derived from the same `decision.steps` that produce `requests`, so the
 * preview and the execution cannot drift apart — the pane shows the requests,
 * the runner performs these, and both come from one decision.
 */
export interface PlanExecution {
  readonly reassign?: { readonly type: "member" | "squad"; readonly id: string };
  readonly comment?: string;
  readonly status?: string;
}

export interface ActionPlan {
  readonly kind: ActionKind;
  readonly title: string;
  readonly decision: Decision;
  /** Requests in the order they will be issued. Empty unless the decision runs. */
  readonly requests: readonly PreviewRequest[];
  /** What the runner performs. Null unless the decision runs. */
  readonly execution: PlanExecution | null;
  /** The comment body verbatim, when the action posts one. */
  readonly comment: string | null;
  readonly mention: string | null;
  /** Rendered above the confirm prompt; the operator should read these. */
  readonly warnings: readonly string[];
}

export interface HandoffPlanInput {
  readonly fromPhase: PhaseNumber;
  readonly issue: IssueSnapshot;
  readonly summary: SlotSummary;
  readonly reentry: ReentryVerdict;
  readonly targetOwnerId: string;
  readonly nextSquad: MentionTarget;
  readonly alreadyMentionedNextSquad: boolean;
}

function handoffComment(toPhase: PhaseNumber, mention: string): string {
  return `${mention} 按 relay-protocol.md 跑 phase ${toPhase}。issue 保持 todo。`;
}

export function planHandoff(input: HandoffPlanInput): ActionPlan {
  const decision = handoffDecision({
    fromPhase: input.fromPhase,
    issue: input.issue,
    summary: input.summary,
    reentry: input.reentry,
    targetOwnerId: input.targetOwnerId,
    alreadyMentionedNextSquad: input.alreadyMentionedNextSquad,
  });

  const toPhase = (input.fromPhase + 1) as PhaseNumber;
  const mention = buildMentionLiteral(input.nextSquad);
  const comment = handoffComment(toPhase, mention);

  const requests: PreviewRequest[] = [];
  if (decision.kind === "run") {
    if (decision.steps.includes("reassign")) {
      requests.push({
        method: "PUT",
        path: `/api/issues/${input.issue.id}`,
        body: JSON.stringify({
          assignee_type: "member",
          assignee_id: input.targetOwnerId,
        }),
      });
    }
    if (decision.steps.includes("mention")) {
      requests.push({
        method: "POST",
        path: `/api/issues/${input.issue.id}/comments`,
        body: comment,
      });
    }
  }

  const execution: PlanExecution | null =
    decision.kind === "run"
      ? {
          ...(decision.steps.includes("reassign")
            ? { reassign: { type: "member" as const, id: input.targetOwnerId } }
            : {}),
          ...(decision.steps.includes("mention") ? { comment } : {}),
        }
      : null;

  return {
    kind: "handoff",
    title: `handoff P${input.fromPhase} → P${toPhase}`,
    decision,
    requests,
    execution,
    comment: decision.steps.includes("mention") ? comment : null,
    mention,
    warnings: [
      "the mention is the only thing that wakes the next squad — a plain-text name does not",
      "the anchor count is checked against the phase total before this is offered",
    ],
  };
}

export interface TerminalReassignPlanInput {
  readonly issue: IssueSnapshot;
  readonly summary: SlotSummary;
  readonly reentry: ReentryVerdict;
  readonly squad: MentionTarget;
  readonly checklistTicked: boolean;
  readonly phaseSummaryPresent: boolean;
}

export function planTerminalReassign(input: TerminalReassignPlanInput): ActionPlan {
  const decision = terminalReassignDecision({
    issue: input.issue,
    summary: input.summary,
    reentry: input.reentry,
    squadId: input.squad.id,
    checklistTicked: input.checklistTicked,
    phaseSummaryPresent: input.phaseSummaryPresent,
  });

  const requests: PreviewRequest[] =
    decision.kind === "run"
      ? [
          {
            method: "PUT",
            path: `/api/issues/${input.issue.id}`,
            body: JSON.stringify({ assignee_type: "squad", assignee_id: input.squad.id }),
          },
        ]
      : [];

  return {
    kind: "terminal-reassign",
    title: "hand the issue to the final squad",
    decision,
    requests,
    execution:
      decision.kind === "run"
        ? { reassign: { type: "squad", id: input.squad.id } }
        : null,
    comment: null,
    mention: null,
    warnings: [
      "this grants the squad leader authority to close the issue to in_review — it does not close it",
      "done remains yours to write, and nothing here writes it",
    ],
  };
}

export interface FinalDonePlanInput {
  readonly issue: IssueSnapshot;
  readonly leaderCloseOutPresent: boolean;
  readonly checklistTicked: boolean;
}

export function planFinalDone(input: FinalDonePlanInput): ActionPlan {
  const decision = finalDoneDecision({
    issue: input.issue,
    leaderCloseOutPresent: input.leaderCloseOutPresent,
    checklistTicked: input.checklistTicked,
  });

  const requests: PreviewRequest[] =
    decision.kind === "run"
      ? [
          {
            method: "PUT",
            path: `/api/issues/${input.issue.id}`,
            body: JSON.stringify({ status: "done" }),
          },
        ]
      : [];

  return {
    kind: "final-done",
    title: "close the relay (write done)",
    decision,
    requests,
    execution: decision.kind === "run" ? { status: "done" } : null,
    comment: null,
    mention: null,
    warnings: ["done is the human terminal action; no agent may write it"],
  };
}

/** Renders a plan's requests for the preview pane. */
export function describePlan(plan: ActionPlan): readonly string[] {
  if (plan.decision.kind === "refuse") return [`refused: ${plan.decision.reason}`];
  if (plan.decision.kind === "noop") return [`nothing to do: ${plan.decision.reason}`];
  return plan.requests.map((request) => `${request.method} ${request.path}`);
}
