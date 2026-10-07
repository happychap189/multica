// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { PhaseNumber } from "../config/phases";
import { PHASE_STAGE_COUNTS, STAGES, nextSlugAfter } from "../config/stages";

import { parseAnchorLine } from "./anchor";
import {
  finalDoneDecision,
  handoffDecision,
  terminalReassignDecision,
  type IssueSnapshot,
} from "./idempotency";
import type { ReentryVerdict } from "./reentry";
import { summarizeSlots, type AnchorOccurrence } from "./slots";

const OK_REENTRY: ReentryVerdict = { allowed: true, reason: "ok", detail: "clear" };
const BLOCKED_REENTRY: ReentryVerdict = {
  allowed: false,
  reason: "active-task",
  detail: "WAIT — task t1 is running",
};

function anchorsThrough(phase: PhaseNumber): AnchorOccurrence[] {
  return STAGES.filter((stage) => stage.phase <= phase).map((stage, index) => {
    const line = `[P${stage.phase} ${stage.indexInPhase}/${PHASE_STAGE_COUNTS[stage.phase]}] ${stage.slug} done → next ${nextSlugAfter(stage.slug)}`;
    const anchor = parseAnchorLine(line);
    if (!anchor) throw new Error(`fixture is not an anchor: ${line}`);
    return {
      anchor,
      commentId: `c${index}`,
      createdAt: new Date(Date.UTC(2026, 9, 4, 0, 0, index)).toISOString(),
      isReply: false,
    };
  });
}

const completeP1 = summarizeSlots(anchorsThrough(1));
const completeP5 = summarizeSlots(anchorsThrough(5));
const empty = summarizeSlots([]);

function issue(overrides: Partial<IssueSnapshot> = {}): IssueSnapshot {
  return {
    id: "issue-1",
    status: "todo",
    assignee_type: "member",
    assignee_id: "owner-1",
    ...overrides,
  };
}

describe("handoffDecision", () => {
  it("runs both steps from a completed phase with no prior handoff", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue(),
      summary: completeP1,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: false,
    });
    expect(decision.kind).toBe("run");
    expect(decision.steps).toEqual(["reassign", "mention"]);
  });

  it("is a no-op once both steps are done", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue({ assignee_type: "member", assignee_id: "owner-2" }),
      summary: completeP1,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: true,
    });
    expect(decision.kind).toBe("noop");
  });

  it("runs only the mention when the owner was already reassigned", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue({ assignee_type: "member", assignee_id: "owner-2" }),
      summary: completeP1,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: false,
    });
    expect(decision.kind).toBe("run");
    expect(decision.steps).toEqual(["mention"]);
  });

  it("runs only the reassign when the squad was already mentioned", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue(),
      summary: completeP1,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: true,
    });
    expect(decision.steps).toEqual(["reassign"]);
  });

  it("refuses when the phase is incomplete", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue(),
      summary: empty,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: false,
    });
    expect(decision.kind).toBe("refuse");
    expect(decision.reason).toContain("phase 1");
  });

  it("refuses when the last anchor is not the phase's final anchor", () => {
    // P1 is complete, but the newest anchor belongs to P3.
    const mixed = summarizeSlots([
      ...anchorsThrough(1),
      ...anchorsThrough(3).slice(9),
    ]);
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue(),
      summary: mixed,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: false,
    });
    expect(decision.kind).toBe("refuse");
  });

  it("refuses while the re-entry guard blocks", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue(),
      summary: completeP1,
      reentry: BLOCKED_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: false,
    });
    expect(decision.kind).toBe("refuse");
    expect(decision.reason).toContain("WAIT");
  });

  it("refuses on the backlog trap before anything else", () => {
    const decision = handoffDecision({
      fromPhase: 1,
      issue: issue({ status: "backlog" }),
      summary: completeP1,
      reentry: OK_REENTRY,
      targetOwnerId: "owner-2",
      alreadyMentionedNextSquad: false,
    });
    expect(decision.kind).toBe("refuse");
    expect(decision.reason).toContain("backlog");
  });

  it("refuses on a terminal issue", () => {
    expect(
      handoffDecision({
        fromPhase: 1,
        issue: issue({ status: "done" }),
        summary: completeP1,
        reentry: OK_REENTRY,
        targetOwnerId: "owner-2",
        alreadyMentionedNextSquad: false,
      }).kind,
    ).toBe("refuse");
  });
});

describe("terminalReassignDecision", () => {
  const base = {
    issue: issue({ assignee_type: "member", assignee_id: "owner-5" }),
    summary: completeP5,
    reentry: OK_REENTRY,
    squadId: "squad-5",
    checklistTicked: true,
    phaseSummaryPresent: true,
  };

  it("runs the reassign once everything is in place", () => {
    const decision = terminalReassignDecision(base);
    expect(decision.kind).toBe("run");
    expect(decision.steps).toEqual(["reassign"]);
  });

  it("is a no-op when the issue already belongs to the squad", () => {
    const decision = terminalReassignDecision({
      ...base,
      issue: issue({ assignee_type: "squad", assignee_id: "squad-5" }),
    });
    expect(decision.kind).toBe("noop");
  });

  it("refuses when the P5 checklist has not been ticked", () => {
    const decision = terminalReassignDecision({ ...base, checklistTicked: false });
    expect(decision.kind).toBe("refuse");
    expect(decision.reason).toContain("checklist");
  });

  it("refuses when the phase summary is missing", () => {
    expect(terminalReassignDecision({ ...base, phaseSummaryPresent: false }).kind).toBe(
      "refuse",
    );
  });

  it("refuses on an incomplete phase 5", () => {
    expect(terminalReassignDecision({ ...base, summary: completeP1 }).kind).toBe("refuse");
  });
});

describe("finalDoneDecision", () => {
  const inReview = issue({ status: "in_review", assignee_type: "squad", assignee_id: "squad-5" });

  it("runs from in_review with the squad holding the issue", () => {
    const decision = finalDoneDecision({
      issue: inReview,
      leaderCloseOutPresent: true,
      checklistTicked: true,
    });
    expect(decision.kind).toBe("run");
    expect(decision.steps).toEqual(["status"]);
  });

  it("is a no-op when the issue is already done", () => {
    const decision = finalDoneDecision({
      issue: { ...inReview, status: "done" },
      leaderCloseOutPresent: true,
      checklistTicked: true,
    });
    expect(decision.kind).toBe("noop");
  });

  it("refuses from any status other than in_review", () => {
    for (const status of ["todo", "in_progress", "blocked", "backlog"]) {
      const decision = finalDoneDecision({
        issue: { ...inReview, status },
        leaderCloseOutPresent: true,
        checklistTicked: true,
      });
      expect(decision.kind).toBe("refuse");
      expect(decision.reason).toContain("in_review");
    }
  });

  it("refuses when the squad does not hold the issue", () => {
    const decision = finalDoneDecision({
      issue: issue({ status: "in_review", assignee_type: "member", assignee_id: "owner-5" }),
      leaderCloseOutPresent: true,
      checklistTicked: true,
    });
    expect(decision.kind).toBe("refuse");
    expect(decision.reason).toContain("squad");
  });

  it("refuses without the close-out comment", () => {
    expect(
      finalDoneDecision({ issue: inReview, leaderCloseOutPresent: false, checklistTicked: true })
        .kind,
    ).toBe("refuse");
  });

  it("refuses without the checklist", () => {
    expect(
      finalDoneDecision({ issue: inReview, leaderCloseOutPresent: true, checklistTicked: false })
        .kind,
    ).toBe("refuse");
  });
});
