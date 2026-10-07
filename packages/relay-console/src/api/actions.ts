import type { ApiClient } from "@multica/core/api/client";
import type { Comment } from "@multica/core/types/comment";
import type { Issue } from "@multica/core/types/issue";

import { assertConsoleWritableStatus } from "../config/red-lines";

/**
 * The single write chokepoint.
 *
 * Every mutation this program can perform lives here, and each one begins with
 * the same two guards. That is deliberate: there is no code path in the console
 * that can move an issue to `in_progress`, `in_review`, or `backlog`, and there
 * is no code path that writes at all under `--read-only`.
 *
 * The protocol assigns the human three write actions — reassign the owner,
 * mention the next squad, and close the relay with `done` — so those are exactly
 * the three this module exposes.
 */

export class WriteRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WriteRefused";
  }
}

export interface ActionContext {
  readonly api: ApiClient;
  /** When true, every action refuses before touching the network. */
  readonly readOnly: boolean;
}

function assertWritable(ctx: ActionContext, what: string): void {
  if (ctx.readOnly) {
    throw new WriteRefused(`--read-only: refusing to ${what}`);
  }
}

/** Hand the issue to the next phase's human owner (§3.9). */
export async function reassignToMember(
  ctx: ActionContext,
  issueId: string,
  memberId: string,
): Promise<Issue> {
  assertWritable(ctx, "reassign the issue");
  return ctx.api.updateIssue(issueId, { assignee_type: "member", assignee_id: memberId });
}

/**
 * Hand the issue to the final squad (§3.10, step 1).
 *
 * This is the only point in a relay where an issue's assignee is a squad; the
 * assignment is what grants that squad's leader the `in_review` close-out
 * authority, so it is never combined with a status write.
 */
export async function reassignToSquad(
  ctx: ActionContext,
  issueId: string,
  squadId: string,
): Promise<Issue> {
  assertWritable(ctx, "reassign the issue to a squad");
  return ctx.api.updateIssue(issueId, { assignee_type: "squad", assignee_id: squadId });
}

/**
 * Post the comment that wakes the next squad.
 *
 * The returned comment carries `trigger_outcomes` when the server reports them;
 * the caller must interpret that field rather than assume the mention landed —
 * a mistyped or stale target produces HTTP 201 and no task at all.
 *
 * `content` must contain a real mention literal built by `buildMentionLiteral`.
 */
export async function postMentionComment(
  ctx: ActionContext,
  issueId: string,
  content: string,
): Promise<Comment> {
  assertWritable(ctx, "post a comment");
  return ctx.api.createComment(issueId, content, "comment");
}

/** Close the relay (§3.10, step 3) — the human-only terminal action. */
export async function closeIssue(
  ctx: ActionContext,
  issueId: string,
  status: string,
): Promise<Issue> {
  assertWritable(ctx, "write the issue status");
  // Refuses anything but `done`, which is the only status this program may
  // write; the red-line module owns that decision, not this call site.
  assertConsoleWritableStatus(status);
  return ctx.api.updateIssue(issueId, { status });
}
