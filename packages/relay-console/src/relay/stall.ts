/**
 * The protocol's three-arm stall verdict (relay-protocol §5.1).
 *
 *   STALL = (arm1 AND arm2) OR arm3
 *
 *   arm1 — no new comment for more than 30 minutes
 *   arm2 — no running/pending task for this issue
 *   arm3 — any task queued more than 15 minutes without being claimed
 *
 * The arm1∧arm2 pairing is what stops a long stage from reading as a stall: a
 * genuinely working stage has a live task AND, eventually, a delivery comment.
 * arm3 stands alone because a daemon that has gone offline never claims its
 * queue, so nothing self-heals.
 *
 * Daemon liveness is a precondition for intervening, not for reporting. When
 * the daemon is known offline the verdict still says "stalled" (the operator
 * wants to see it) but `interventionAllowed` is false — the protocol's remedy
 * is to restore the daemon first. There is no direct daemon probe in the API
 * surface this console uses, so callers pass a tri-state heuristic.
 */

export const ARM1_QUIET_MS = 30 * 60 * 1000;
export const ARM3_QUEUED_MS = 15 * 60 * 1000;

/** Statuses that mean a task is live (or parked) for this issue. */
export const ACTIVE_TASK_STATUSES: ReadonlySet<string> = new Set([
  "queued",
  "dispatched",
  "running",
  "pending",
  "waiting_local_directory",
]);

export interface TaskLike {
  readonly id: string;
  readonly issue_id: string;
  readonly status: string;
  /** When the task row was created — the best available "entered queue" stamp. */
  readonly created_at: string;
  readonly dispatched_at?: string | null;
  readonly is_leader_task?: boolean;
}

export type DaemonLiveness = boolean | "unknown";

export interface StallInput {
  /** Epoch milliseconds. Always injected — this module never reads a clock. */
  readonly now: number;
  /** The issue under watch; snapshot rows are filtered to it. */
  readonly issueId: string;
  /** Epoch milliseconds of the newest comment for the issue, or null if none. */
  readonly lastCommentAt: number | null;
  /** Snapshot rows; may cover the whole workspace. */
  readonly tasks: readonly TaskLike[];
  readonly daemonOnline: DaemonLiveness;
}

export type StallArmId = 1 | 2 | 3;

export interface StallArm {
  readonly id: StallArmId;
  readonly active: boolean;
  readonly detail: string;
}

export interface StallVerdict {
  readonly stalled: boolean;
  readonly arms: readonly StallArm[];
  readonly daemonOnline: DaemonLiveness;
  /** False when the daemon precondition fails; the verdict is still reported. */
  readonly interventionAllowed: boolean;
  readonly quietMinutes: number | null;
  readonly activeTaskCount: number;
  readonly oldestQueuedMinutes: number | null;
}

function minutesBetween(now: number, then: number): number {
  return Math.floor((now - then) / 60000);
}

/** Tasks for an issue that are live or parked (excludes terminal rows). */
export function activeTasksFor(
  tasks: readonly TaskLike[],
  issueId: string,
): readonly TaskLike[] {
  return tasks.filter(
    (task) => task.issue_id === issueId && ACTIVE_TASK_STATUSES.has(task.status),
  );
}

export function evaluateStall(input: StallInput): StallVerdict {
  const active = activeTasksFor(input.tasks, input.issueId);
  const activeTaskCount = active.length;

  const quietMinutes =
    input.lastCommentAt === null ? null : minutesBetween(input.now, input.lastCommentAt);
  const arm1 = quietMinutes !== null && quietMinutes * 60000 > ARM1_QUIET_MS;
  const arm2 = activeTaskCount === 0;

  const queued = active.filter((task) => task.status === "queued");
  let oldestQueuedMinutes: number | null = null;
  for (const task of queued) {
    const created = Date.parse(task.created_at);
    if (Number.isNaN(created)) continue;
    const age = minutesBetween(input.now, created);
    if (oldestQueuedMinutes === null || age > oldestQueuedMinutes) {
      oldestQueuedMinutes = age;
    }
  }
  const arm3 = oldestQueuedMinutes !== null && oldestQueuedMinutes * 60000 > ARM3_QUEUED_MS;

  const stalled = (arm1 && arm2) || arm3;

  return {
    stalled,
    arms: [
      {
        id: 1,
        active: arm1,
        detail:
          quietMinutes === null
            ? "no comments yet"
            : `quiet ${quietMinutes}m (threshold ${ARM1_QUIET_MS / 60000}m)`,
      },
      {
        id: 2,
        active: arm2,
        detail: `${activeTaskCount} active task(s)`,
      },
      {
        id: 3,
        active: arm3,
        detail:
          oldestQueuedMinutes === null
            ? "no queued task"
            : `oldest queued ${oldestQueuedMinutes}m (threshold ${ARM3_QUEUED_MS / 60000}m)`,
      },
    ],
    daemonOnline: input.daemonOnline,
    interventionAllowed: stalled && input.daemonOnline !== false,
    quietMinutes,
    activeTaskCount,
    oldestQueuedMinutes,
  };
}
