import { isTerminalStatus } from "../config/red-lines";

import { activeTasksFor, type TaskLike } from "./stall";

/**
 * The re-entry guard (relay-protocol §5.2).
 *
 * Before any intervention — re-@, re-dispatch, or a handoff — the operator must
 * have read the last progress anchor and confirmed no stage is currently
 * running. If a task IS running, the only legal action is to wait: re-dispatching
 * a live stage produces duplicate artifacts and a duplicate anchor, which breaks
 * the anchor-count check the whole protocol leans on.
 *
 * This returns a refusal rather than a warning, because the protocol's guard is
 * a prohibition, not advice. An unreadable or absent anchor is also a refusal —
 * §5.2 says to register it (§5.5) and confirm against the task snapshot by hand
 * rather than guess at the progress.
 */
export type ReentryReason = "ok" | "active-task" | "anchor-unreadable" | "terminal-issue";

export interface ReentryInput {
  readonly issueId: string;
  /** The issue's current status; a finished relay has nothing to intervene in. */
  readonly issueStatus: string;
  /** Whether the timeline yielded a parseable last anchor. */
  readonly lastAnchorReadable: boolean;
  /** Snapshot rows; may cover the whole workspace. */
  readonly tasks: readonly TaskLike[];
}

export interface ReentryVerdict {
  readonly allowed: boolean;
  readonly reason: ReentryReason;
  /** Ready to render; explains the refusal in the operator's terms. */
  readonly detail: string;
}

export function canIntervene(input: ReentryInput): ReentryVerdict {
  // A completed relay is not stalled, it is over. Measured on AIDL-3: a `done`
  // issue is quiet for days with no active task, which satisfies arm1∧arm2
  // exactly — reporting that as a stall (and offering to intervene) would be a
  // pure false alarm.
  if (isTerminalStatus(input.issueStatus)) {
    return {
      allowed: false,
      reason: "terminal-issue",
      detail: `issue is ${input.issueStatus}; the relay is over — nothing to intervene in`,
    };
  }

  const active = activeTasksFor(input.tasks, input.issueId);

  // The anchor check comes first: with no trustworthy anchor there is no way to
  // tell which stage the running-task check should even be about.
  if (!input.lastAnchorReadable) {
    return {
      allowed: false,
      reason: "anchor-unreadable",
      detail:
        "no readable progress anchor — register the recovery event (§5.5) and confirm the task snapshot manually",
    };
  }

  const running = active.find(
    (task) => task.status === "running" || task.status === "dispatched",
  );
  if (running) {
    return {
      allowed: false,
      reason: "active-task",
      detail: `WAIT — task ${running.id} is ${running.status}; the only legal action is to wait`,
    };
  }

  const parked = active.find((task) => task.status === "queued" || task.status === "pending");
  if (parked) {
    return {
      allowed: false,
      reason: "active-task",
      detail: `WAIT — task ${parked.id} is ${parked.status}; re-dispatching would double the anchor`,
    };
  }

  return { allowed: true, reason: "ok", detail: "no active task; intervention permitted" };
}
