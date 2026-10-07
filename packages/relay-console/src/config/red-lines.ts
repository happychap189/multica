/**
 * The protocol's status red lines (relay-protocol §6.1).
 *
 *   - an issue must never enter `backlog` — that freezes the pending-assignment
 *     trigger, so an `@squad` produces no task and the chain breaks silently;
 *   - agents do not write issue status (the sole exception, in the terminal
 *     two-stage close, is the final leader moving to `in_review`);
 *   - `done` is written by a human only.
 *
 * The console acts as that human. It may therefore write exactly one status —
 * `done` — and this module is the single place that decides so: every write
 * path calls `assertConsoleWritableStatus` first, which means there is no code
 * path in this program that can move an issue to `in_progress`, `in_review`, or
 * `backlog`.
 */

/** The only status this program is permitted to write. */
export const CONSOLE_WRITABLE_STATUSES: readonly string[] = ["done"];

/**
 * Statuses that must never be written by this program, with the reason rendered
 * in the refusal. Kept separate from the allow-list so the error explains itself.
 */
export const FORBIDDEN_STATUS_REASONS: Readonly<Record<string, string>> = Object.freeze({
  backlog:
    "entering backlog freezes the pending-assignment trigger — the relay breaks silently",
  in_progress: "agents (and their drivers) must not write issue status",
  in_review: "only the final phase's squad leader may move an issue to in_review",
});

export class RedLineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedLineError";
  }
}

export function isConsoleWritableStatus(status: string): boolean {
  return CONSOLE_WRITABLE_STATUSES.includes(status);
}

/** Throws when `status` is not one this program may write. */
export function assertConsoleWritableStatus(status: string): void {
  if (isConsoleWritableStatus(status)) return;
  const why = FORBIDDEN_STATUS_REASONS[status];
  throw new RedLineError(
    why === undefined
      ? `relay-console may only write ${CONSOLE_WRITABLE_STATUSES.join(", ")} (asked for '${status}')`
      : `refusing to write '${status}': ${why}`,
  );
}

/**
 * The backlog guard, for the watcher rather than the writer: an issue seen in
 * `backlog` mid-relay is a critical alert, because the next `@squad` will do
 * nothing at all.
 */
export function isBacklogTrap(status: string): boolean {
  return status === "backlog";
}

/** Statuses from which no forward relay action is possible. */
export function isTerminalStatus(status: string): boolean {
  return status === "done" || status === "cancelled";
}
