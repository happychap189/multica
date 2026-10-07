// @vitest-environment node

import { describe, expect, it } from "vitest";

import { activeTasksFor, evaluateStall, type TaskLike } from "./stall";

const ISSUE = "issue-1";
const OTHER = "issue-2";
const NOW = Date.parse("2026-10-04T12:00:00Z");

/** Epoch milliseconds, for `lastCommentAt`. */
function msAgo(minutes: number): number {
  return NOW - minutes * 60000;
}

/** ISO string, for `TaskLike.created_at` (the wire shape). */
function isoAgo(minutes: number): string {
  return new Date(msAgo(minutes)).toISOString();
}

function task(overrides: Partial<TaskLike> = {}): TaskLike {
  return {
    id: "t1",
    issue_id: ISSUE,
    status: "running",
    created_at: isoAgo(1),
    ...overrides,
  };
}

function verdict(overrides: Partial<Parameters<typeof evaluateStall>[0]> = {}) {
  return evaluateStall({
    now: NOW,
    issueId: ISSUE,
    lastCommentAt: msAgo(1),
    tasks: [],
    daemonOnline: true,
    ...overrides,
  });
}

describe("activeTasksFor", () => {
  it("keeps live and parked statuses only", () => {
    const tasks = [
      task({ id: "a", status: "queued" }),
      task({ id: "b", status: "running" }),
      task({ id: "c", status: "completed" }),
      task({ id: "d", status: "failed" }),
      task({ id: "e", status: "cancelled" }),
      task({ id: "f", status: "waiting_local_directory" }),
    ];
    expect(activeTasksFor(tasks, ISSUE).map((t) => t.id)).toEqual(["a", "b", "f"]);
  });

  it("ignores another issue's tasks", () => {
    expect(activeTasksFor([task({ issue_id: OTHER })], ISSUE)).toHaveLength(0);
  });
});

describe("evaluateStall", () => {
  it("does not stall on arm1 alone — a long stage has a live task", () => {
    const result = verdict({ lastCommentAt: msAgo(45), tasks: [task()] });
    expect(result.arms[0]?.active).toBe(true);
    expect(result.arms[1]?.active).toBe(false);
    expect(result.stalled).toBe(false);
  });

  it("stalls when arm1 and arm2 hold together", () => {
    const result = verdict({ lastCommentAt: msAgo(45), tasks: [] });
    expect(result.stalled).toBe(true);
  });

  it("does not stall while comments are still arriving", () => {
    const result = verdict({ lastCommentAt: msAgo(10), tasks: [] });
    expect(result.arms[0]?.active).toBe(false);
    expect(result.stalled).toBe(false);
  });

  it("stalls on arm3 alone — an unclaimed queue never self-heals", () => {
    const result = verdict({
      lastCommentAt: msAgo(1),
      tasks: [task({ status: "queued", created_at: isoAgo(16) })],
    });
    expect(result.arms[2]?.active).toBe(true);
    expect(result.stalled).toBe(true);
  });

  it("does not stall on a recently queued task", () => {
    const result = verdict({
      tasks: [task({ status: "queued", created_at: isoAgo(14) })],
    });
    expect(result.stalled).toBe(false);
  });

  it("measures queue age from the oldest queued task", () => {
    const result = verdict({
      tasks: [
        task({ id: "new", status: "queued", created_at: isoAgo(2) }),
        task({ id: "old", status: "queued", created_at: isoAgo(20) }),
      ],
    });
    expect(result.oldestQueuedMinutes).toBe(20);
    expect(result.stalled).toBe(true);
  });

  it("treats the arm1 threshold as exclusive", () => {
    // Exactly 30 minutes quiet is not yet "more than 30 minutes".
    const result = verdict({ lastCommentAt: msAgo(30), tasks: [] });
    expect(result.arms[0]?.active).toBe(false);
    expect(result.stalled).toBe(false);
  });

  it("reports a stall but forbids intervening when the daemon is offline", () => {
    const result = verdict({
      lastCommentAt: msAgo(45),
      tasks: [],
      daemonOnline: false,
    });
    expect(result.stalled).toBe(true);
    expect(result.interventionAllowed).toBe(false);
  });

  it("permits intervention when daemon liveness is unknown", () => {
    const result = verdict({
      lastCommentAt: msAgo(45),
      tasks: [],
      daemonOnline: "unknown",
    });
    expect(result.stalled).toBe(true);
    expect(result.interventionAllowed).toBe(true);
  });

  it("handles a timeline with no comments at all", () => {
    const result = verdict({ lastCommentAt: null, tasks: [] });
    expect(result.quietMinutes).toBeNull();
    expect(result.arms[0]?.active).toBe(false);
    expect(result.stalled).toBe(false);
  });

  it("exposes the numbers the panel renders", () => {
    const result = verdict({
      lastCommentAt: msAgo(45),
      tasks: [task({ status: "queued", created_at: isoAgo(20) })],
    });
    expect(result.quietMinutes).toBe(45);
    expect(result.activeTaskCount).toBe(1);
    expect(result.oldestQueuedMinutes).toBe(20);
    expect(result.arms).toHaveLength(3);
  });
});
