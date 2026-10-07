import type { Comment } from "@multica/core/types/comment";

import { PHASES, type PhaseNumber } from "../config/phases";
import { PHASE_SUMMARY_SLUG } from "../config/stages";
import type { RosterEntry } from "../api/roster";
import { mentionsIn } from "../relay/mentions";
import { completedPhases, type SlotSummary } from "../relay/slots";

import {
  planFinalDone,
  planHandoff,
  planTerminalReassign,
  type ActionKind,
  type ActionPlan,
} from "./action-model";
import type { RelayViewModel } from "./view-model";

/**
 * Turns the current view into the set of actions an operator may take.
 *
 * Only decisions the relay has actually reached are offered: a handoff needs the
 * phase's last anchor, the terminal reassign needs phase 5 swept, and `done`
 * needs the squad to be holding the issue. Everything else comes back as a
 * refusal with its reason, which the pane renders rather than hides.
 *
 * Two signals are derived rather than read off the wire, and both are shown in
 * the preview so the operator can overrule them:
 *   - `phaseSummaryPresent` — a comment opening with the `[phase 交付摘要]`
 *     marker;
 *   - `leaderCloseOutPresent` — taken from `status === "in_review"`, because the
 *     leader's close-out *is* the status change (§3.10 step 2) and the status is
 *     authoritative, whereas the comment wording is not specified anywhere.
 */

export type ChecklistTicks = Partial<Record<ActionKind, boolean>>;

export interface PlansInput {
  readonly model: RelayViewModel;
  readonly comments: readonly Comment[];
  readonly squads: readonly RosterEntry[];
  /** The member the issue is currently assigned to, when it is a member. */
  readonly currentOwnerId: string | null;
  readonly checklistTicked: ChecklistTicks;
}

export const PHASE_SUMMARY_MARKER = "[phase 交付摘要]";

/** The phase whose final anchor is the newest anchor. */
export function completedPhase(summary: SlotSummary): PhaseNumber | null {
  const done = completedPhases(summary);
  const last = summary.last?.anchor;
  if (!last || !done.includes(last.phase)) return null;
  if (last.next !== PHASE_SUMMARY_SLUG) return null;
  return last.phase;
}

export function phaseSummaryPresent(comments: readonly Comment[]): boolean {
  return comments.some((comment) => comment.content.includes(PHASE_SUMMARY_MARKER));
}

/**
 * Whether the next squad was already mentioned after the newest anchor.
 *
 * Only comments posted after that anchor count: an earlier mention belongs to an
 * earlier stage, and treating it as the handoff would suppress the one post that
 * actually starts the next phase.
 */
export function alreadyMentionedAfter(
  comments: readonly Comment[],
  lastAnchorCommentId: string | null,
  squadId: string,
): boolean {
  const index = lastAnchorCommentId === null
    ? -1
    : comments.findIndex((comment) => comment.id === lastAnchorCommentId);
  const tail = index === -1 ? comments : comments.slice(index + 1);
  return tail.some((comment) =>
    mentionsIn(comment.content).some((mention) => mention.kind === "squad" && mention.id === squadId),
  );
}

function squadNamed(squads: readonly RosterEntry[], name: string): RosterEntry | undefined {
  return squads.find((squad) => squad.name === name);
}

export function buildPlans(input: PlansInput): readonly ActionPlan[] {
  const { model, comments, squads, currentOwnerId } = input;
  const summary = model.summary;
  const issue = {
    id: model.issue.id,
    status: model.issue.status,
    assignee_type: model.issue.assigneeType,
    assignee_id: model.issue.assigneeId,
  };

  const plans: ActionPlan[] = [];

  const done = completedPhase(summary);
  const nextPhase = done === null ? null : ((done + 1) as PhaseNumber);
  if (done !== null && nextPhase !== null) {
    const nextSquad = squadNamed(squads, PHASES[nextPhase - 1]?.squadName ?? "");
    if (nextSquad) {
      plans.push(
        planHandoff({
          fromPhase: done,
          issue,
          summary,
          reentry: model.reentry,
          // Defaulting to the current owner keeps the documented single-operator
          // run working: reassigning to yourself is a legitimate handoff step.
          targetOwnerId: currentOwnerId ?? issue.assignee_id ?? "",
          nextSquad: { kind: "squad", name: nextSquad.name, id: nextSquad.id },
          alreadyMentionedNextSquad: alreadyMentionedAfter(
            comments,
            summary.last?.commentId ?? null,
            nextSquad.id,
          ),
        }),
      );
    }
  }

  const p5Squad = squadNamed(squads, PHASES[4]?.squadName ?? "");
  if (p5Squad) {
    plans.push(
      planTerminalReassign({
        issue,
        summary,
        reentry: model.reentry,
        squad: { kind: "squad", name: p5Squad.name, id: p5Squad.id },
        checklistTicked: input.checklistTicked["terminal-reassign"] === true,
        phaseSummaryPresent: phaseSummaryPresent(comments),
      }),
    );
  }

  plans.push(
    planFinalDone({
      issue,
      // See the module note: the leader's close-out is the status change.
      leaderCloseOutPresent: model.issue.status === "in_review",
      checklistTicked: input.checklistTicked["final-done"] === true,
    }),
  );

  return plans;
}
