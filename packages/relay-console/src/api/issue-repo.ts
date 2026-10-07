import type { ApiClient } from "@multica/core/api/client";
import type { AgentTask } from "@multica/core/types/agent";
import type { Comment } from "@multica/core/types/comment";
import type { Issue } from "@multica/core/types/issue";

import type { IssueSnapshot } from "../relay/idempotency";

/**
 * Thin read wrappers over the core client.
 *
 * These exist so the rest of the program never touches `ApiClient` directly:
 * the relay logic consumes plain values, and the shape conversion from the wire
 * type to the relay's own snapshot lives in one place.
 */

/** Accepts a uuid or a human identifier such as `AIDL-3`. */
export async function loadIssue(api: ApiClient, ref: string): Promise<Issue> {
  return api.getIssue(ref);
}

/**
 * Every comment on the issue, newest last.
 *
 * The core client's `listComments` is a single unpaginated GET. If the server
 * truncates a long thread, anchors go missing silently — the caller is expected
 * to compare the returned count against any server-reported total and alert
 * rather than trust it.
 */
export async function loadComments(api: ApiClient, issueId: string): Promise<Comment[]> {
  return api.listComments(issueId);
}

/**
 * The workspace task snapshot: every active task plus each agent's most recent
 * outcome row. Read by the stall arms and the post-write probe.
 */
export async function loadTasks(api: ApiClient): Promise<AgentTask[]> {
  return api.getAgentTaskSnapshot();
}

export function snapshotOf(issue: Issue): IssueSnapshot {
  return {
    id: issue.id,
    status: issue.status,
    assignee_type: issue.assignee_type,
    assignee_id: issue.assignee_id,
  };
}
