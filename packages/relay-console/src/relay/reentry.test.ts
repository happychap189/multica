// @vitest-environment node

import { describe, expect, it } from "vitest";

import { canIntervene } from "./reentry";
import type { TaskLike } from "./stall";

const ISSUE = "issue-1";

function task(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: "t1",
    issue_id: ISSUE,
    status: "running",
    created_at: "2026-10-04T12:00:00Z",
    ...overrides,
  };
}

function verdict(tasks: readonly TaskLike[], lastAnchorReadable = true, issueStatus = "todo") {
  return canIntervene({ issueId: ISSUE, issueStatus, lastAnchorReadable, tasks });
}

describe("canIntervene", () => {
  it("permits intervention when no task is active", () => {
    const result = verdict([]);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("ok");
  });

  it("refuses on a finished relay regardless of the task list", () => {
    // Measured on AIDL-3: a done issue is quiet for days with no active task,
    // which is exactly arm1 AND arm2. That is not a stall.
    for (const status of ["done", "cancelled"]) {
      const result = verdict([], true, status);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("terminal-issue");
      expect(result.detail).toContain("relay is over");
    }
  });

  it("refuses while a task is running — the only legal action is to wait", () => {
    const result = verdict([task({ id: "run-1", status: "running" })]);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("active-task");
    expect(result.detail).toContain("WAIT");
    expect(result.detail).toContain("run-1");
  });

  it("refuses while a task is dispatched", () => {
    expect(verdict([task({ status: "dispatched" })]).reason).toBe("active-task");
  });

  it("refuses while a task sits queued", () => {
    // Re-dispatching a parked stage would double the anchor.
    expect(verdict([task({ status: "queued" })]).reason).toBe("active-task");
  });

  it("refuses when the last anchor is unreadable", () => {
    const result = verdict([], false);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("anchor-unreadable");
    expect(result.detail).toContain("5.5");
  });

  it("checks the anchor before the task list", () => {
    const result = verdict([task()], false);
    expect(result.reason).toBe("anchor-unreadable");
  });

  it("ignores another issue's active task", () => {
    const result = verdict([task({ issue_id: "other" })]);
    expect(result.allowed).toBe(true);
  });

  it("ignores terminal task rows", () => {
    const result = verdict([task({ status: "completed" }), task({ status: "failed" })]);
    expect(result.allowed).toBe(true);
  });
});
