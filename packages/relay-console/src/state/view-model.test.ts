// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  P1_ANCHORS,
  TEST_ISSUE_ID,
  TEST_NOW,
  TEST_WORKSPACE,
  makeComment,
  makeIssue,
  makeTask,
} from "../testing/fixtures";

import { buildViewModel, phaseProgress } from "./view-model";

function model(overrides: Partial<Parameters<typeof buildViewModel>[0]> = {}) {
  return buildViewModel({
    workspace: TEST_WORKSPACE,
    issue: makeIssue(),
    comments: [],
    tasks: [],
    readOnly: true,
    now: TEST_NOW,
    ...overrides,
  });
}

describe("buildViewModel", () => {
  it("counts anchors from the comment stream", () => {
    const view = model({ comments: P1_ANCHORS.map((line) => makeComment(line)) });
    expect(view.summary.uniqueCount).toBe(3);
    expect(phaseProgress(view.summary)[0]).toEqual({ phase: 1, filled: 3, total: 3 });
  });

  it("counts anchors posted as thread replies", () => {
    // Measured on AIDL-3: every anchor is a reply, because agents answer inside
    // threads. Scanning only top-level comments would lose all 33.
    const view = model({ comments: [makeComment(P1_ANCHORS[0] ?? "", { parent_id: "root-1" })] });
    expect(view.summary.uniqueCount).toBe(1);
  });

  it("raises a critical alert on the backlog trap", () => {
    const view = model({ issue: makeIssue({ status: "backlog" }) });
    expect(
      view.alerts.some((a) => a.severity === "critical" && a.message.includes("BACKLOG")),
    ).toBe(true);
  });

  it("does not report a stall for a finished relay", () => {
    // A done issue is quiet for days with no active task — arm1 AND arm2 hold —
    // so this is exactly the false alarm the status check exists to prevent.
    const view = model({
      issue: makeIssue({ status: "done" }),
      comments: P1_ANCHORS.map((line) => makeComment(line)),
    });
    expect(view.stall.stalled).toBe(true);
    expect(view.stallApplies).toBe(false);
    expect(view.alerts.some((a) => a.message.startsWith("STALL"))).toBe(false);
    expect(view.reentry.reason).toBe("terminal-issue");
  });

  it("reports a stall for an in-flight relay with a quiet timeline", () => {
    const view = model({
      issue: makeIssue({ status: "in_progress" }),
      comments: [makeComment(P1_ANCHORS[0] ?? "")],
      tasks: [],
    });
    expect(view.stallApplies).toBe(true);
    expect(
      view.alerts.some((a) => a.severity === "critical" && a.message.startsWith("STALL")),
    ).toBe(true);
  });

  it("refuses intervention while a stage is running", () => {
    const view = model({
      issue: makeIssue({ status: "in_progress" }),
      comments: [makeComment(P1_ANCHORS[0] ?? "")],
      tasks: [makeTask()],
    });
    expect(view.reentry.allowed).toBe(false);
    expect(view.reentry.reason).toBe("active-task");
    expect(view.alerts.some((a) => a.message.includes("WAIT"))).toBe(true);
  });

  it("surfaces a non-protocol anchor marker as a warning", () => {
    const view = model({
      comments: [makeComment("[P3 5/9] reverse-engineering done (skip) → next refined-mockups")],
    });
    expect(view.summary.uniqueCount).toBe(1);
    expect(
      view.alerts.some((a) => a.severity === "warning" && a.message.includes("(skip)")),
    ).toBe(true);
  });

  it("reports a reduced path as an informational note, not a warning", () => {
    const view = model({
      comments: [
        makeComment("[P2 1/4] intent-capture done → next feasibility"),
        makeComment("[P2 2/4] feasibility done → next rough-mockups"),
      ],
    });
    expect(view.alerts.some((a) => a.severity === "warning")).toBe(false);
    expect(view.alerts.some((a) => a.severity === "info" && a.message.includes("reduced path"))).toBe(
      true,
    );
  });

  it("keeps only this issue's task rows", () => {
    const view = model({
      tasks: [
        makeTask({ issue_id: TEST_ISSUE_ID }),
        makeTask({ issue_id: "elsewhere" }),
      ],
    });
    expect(view.tasks).toHaveLength(1);
  });

  it("infers daemon liveness from a live task and stays unknown otherwise", () => {
    expect(model({ tasks: [makeTask()] }).daemonOnline).toBe(true);
    expect(model({ tasks: [] }).daemonOnline).toBe("unknown");
  });
});
