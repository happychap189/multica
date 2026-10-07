import type { AgentTask } from "@multica/core/types/agent";
import type { Comment } from "@multica/core/types/comment";
import type { Issue } from "@multica/core/types/issue";

import type { ResolvedWorkspace } from "../api/client";

/**
 * Wire-shaped fixtures shared by the tests.
 *
 * These build complete objects rather than loose literals on purpose: the
 * console reads real `Issue` / `Comment` / `AgentTask` payloads, so a fixture
 * that drifts from the wire type would make the tests pass against a shape the
 * backend never sends.
 */

export const TEST_NOW = Date.parse("2026-10-04T12:00:00Z");
export const TEST_ISSUE_ID = "issue-1";

export const TEST_WORKSPACE: ResolvedWorkspace = {
  id: "ws-1",
  slug: "aidlc-relay",
  name: "aidlc-relay",
};

export function isoAgo(minutes: number): string {
  return new Date(TEST_NOW - minutes * 60000).toISOString();
}

/** Epoch milliseconds, for fields the console treats as numbers. */
export function msAgo(minutes: number): number {
  return TEST_NOW - minutes * 60000;
}

export function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: TEST_ISSUE_ID,
    workspace_id: TEST_WORKSPACE.id,
    number: 3,
    identifier: "AIDL-3",
    title: "fullrun",
    description: null,
    status: "todo",
    priority: "none",
    assignee_type: "member",
    assignee_id: "owner-1",
    creator_type: "member",
    creator_id: "owner-1",
    parent_issue_id: null,
    project_id: null,
    position: 0,
    stage: null,
    start_date: null,
    due_date: null,
    metadata: {},
    properties: {},
    created_at: isoAgo(600),
    updated_at: isoAgo(1),
    revision: 7,
    ...overrides,
  };
}

let commentSeq = 0;

export function makeComment(content: string, overrides: Partial<Comment> = {}): Comment {
  commentSeq += 1;
  return {
    id: `c-${commentSeq}`,
    issue_id: TEST_ISSUE_ID,
    author_type: "agent",
    author_id: "agent-1",
    content,
    type: "comment",
    // Agents answer inside threads: measured 142 of 153 comments on AIDL-3.
    parent_id: "root-1",
    reactions: [],
    attachments: [],
    created_at: isoAgo(45),
    updated_at: isoAgo(45),
    resolved_at: null,
    resolved_by_type: null,
    resolved_by_id: null,
    ...overrides,
  };
}

let taskSeq = 0;

export function makeTask(overrides: Partial<AgentTask> = {}): AgentTask {
  taskSeq += 1;
  return {
    id: `task-${taskSeq}`,
    agent_id: "agent-1",
    runtime_id: "runtime-1",
    issue_id: TEST_ISSUE_ID,
    status: "running",
    priority: 0,
    dispatched_at: isoAgo(1),
    started_at: isoAgo(1),
    completed_at: null,
    result: null,
    error: null,
    created_at: isoAgo(1),
    ...overrides,
  };
}

/** The three anchors of a complete phase 1. */
export const P1_ANCHORS = [
  "[P1 1/3] state-init done → next workspace-detection",
  "[P1 2/3] workspace-detection done → next workspace-scaffold",
  "[P1 3/3] workspace-scaffold done → next phase-summary",
];
