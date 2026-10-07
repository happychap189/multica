import { describeVerdict, interpretTriggerOutcomes } from "../relay/triggers";
import { describePlan, type ActionPlan } from "../state/action-model";

import {
  closeIssue,
  postMentionComment,
  reassignToMember,
  reassignToSquad,
  type ActionContext,
} from "./actions";
import { describeProbe, probeForTask, type ProbeSource } from "./verify";

/**
 * Runs a confirmed plan.
 *
 * Three rules hold here, and they are what make an automated write safe in a
 * protocol with no server-side enforcement:
 *
 *   - only a plan whose decision is `run` executes; a refusal or a no-op reports
 *     its reason and touches nothing;
 *   - a mention is never assumed to have landed. The response's
 *     `trigger_outcomes` decides when present, and when the server omits the
 *     field (older builds) the task-snapshot probe decides instead;
 *   - nothing is retried. A failed step is reported with what to do about it —
 *     re-posting a mention that did land would duplicate the very work the
 *     protocol's recovery section exists to prevent.
 */

export interface ExecuteDeps {
  readonly ctx: ActionContext;
  readonly issueId: string;
  /** Task snapshot source for the post-write probe. */
  readonly source: ProbeSource;
  /** Squad member ids, to narrow the probe. Empty means any agent. */
  readonly agentIds?: readonly string[];
  /** Task ids present before the write. */
  readonly baselineTaskIds?: readonly string[];
  readonly probeTimeoutMs?: number;
  readonly probeIntervalMs?: number;
}

export interface ExecuteResult {
  readonly lines: readonly string[];
  /** True once any request reached the backend. */
  readonly wrote: boolean;
}

export async function executePlan(plan: ActionPlan, deps: ExecuteDeps): Promise<ExecuteResult> {
  if (plan.decision.kind !== "run") {
    return { lines: [...describePlan(plan)], wrote: false };
  }
  const execution = plan.execution;
  if (!execution) {
    return { lines: ["nothing to execute"], wrote: false };
  }

  const lines: string[] = [];
  let wrote = false;

  try {
    if (execution.reassign) {
      const { type, id } = execution.reassign;
      if (type === "member") await reassignToMember(deps.ctx, deps.issueId, id);
      else await reassignToSquad(deps.ctx, deps.issueId, id);
      wrote = true;
      lines.push(`reassigned to ${type} ${id}`);
    }

    if (execution.comment) {
      const comment = await postMentionComment(deps.ctx, deps.issueId, execution.comment);
      wrote = true;
      lines.push("comment posted");

      const verdict = interpretTriggerOutcomes(comment, execution.comment);
      lines.push(describeVerdict(verdict));

      if (verdict.kind === "unverified") {
        // The server did not (or could not) report what the mention did, so the
        // only remaining evidence is a task row appearing.
        const probe = await probeForTask({
          source: deps.source,
          issueId: deps.issueId,
          agentIds: deps.agentIds,
          baselineTaskIds: deps.baselineTaskIds,
          timeoutMs: deps.probeTimeoutMs,
          intervalMs: deps.probeIntervalMs,
        });
        lines.push(describeProbe(probe, plan.mention ?? "the target"));
      }
    }

    if (execution.status) {
      await closeIssue(deps.ctx, deps.issueId, execution.status);
      wrote = true;
      lines.push(`status → ${execution.status}`);
    }
  } catch (error) {
    // Report and stop; the operator decides whether to re-run the remaining
    // step by hand. Never retry automatically.
    lines.push(`FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { lines, wrote };
}
