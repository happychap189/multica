// @vitest-environment node

import { describe, expect, it } from "vitest";

import { PHASE_STAGE_COUNTS, STAGES, nextSlugAfter } from "../config/stages";
import type { PhaseNumber } from "../config/phases";
import { parseAnchorLine } from "../relay/anchor";
import type { IssueSnapshot } from "../relay/idempotency";
import type { ReentryVerdict } from "../relay/reentry";
import { summarizeSlots, type AnchorOccurrence } from "../relay/slots";

import {
  describePlan,
  planFinalDone,
  planHandoff,
  planTerminalReassign,
} from "./action-model";

const OK: ReentryVerdict = { allowed: true, reason: "ok", detail: "clear" };

function anchorsThrough(phase: PhaseNumber): AnchorOccurrence[] {
  return STAGES.filter((stage) => stage.phase <= phase).map((stage, index) => {
    const line = `[P${stage.phase} ${stage.indexInPhase}/${PHASE_STAGE_COUNTS[stage.phase]}] ${stage.slug} done → next ${nextSlugAfter(stage.slug)}`;
    const anchor = parseAnchorLine(line);
    if (!anchor) throw new Error(line);
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

const ISSUE: IssueSnapshot = {
  id: "issue-1",
  status: "todo",
  assignee_type: "member",
  assignee_id: "owner-1",
};

const NEXT_SQUAD = { kind: "squad" as const, name: "aidlc-阶段二-构思", id: "squad-2" };

describe("planHandoff", () => {
  it("previews the reassign and the mention, with the literal verbatim", () => {
    const plan = planHandoff({
      fromPhase: 1,
      issue: ISSUE,
      summary: completeP1,
      reentry: OK,
      targetOwnerId: "owner-2",
      nextSquad: NEXT_SQUAD,
      alreadyMentionedNextSquad: false,
    });

    expect(plan.decision.kind).toBe("run");
    expect(plan.requests).toHaveLength(2);
    expect(plan.requests[0]).toMatchObject({ method: "PUT", path: "/api/issues/issue-1" });
    expect(JSON.parse(plan.requests[0]?.body ?? "{}")).toEqual({
      assignee_type: "member",
      assignee_id: "owner-2",
    });
    expect(plan.mention).toBe("[@aidlc-阶段二-构思](mention://squad/squad-2)");
    expect(plan.comment).toContain(plan.mention ?? "");
    expect(plan.title).toBe("handoff P1 → P2");
  });

  it("previews nothing when the phase is not complete", () => {
    const plan = planHandoff({
      fromPhase: 1,
      issue: ISSUE,
      summary: summarizeSlots([]),
      reentry: OK,
      targetOwnerId: "owner-2",
      nextSquad: NEXT_SQUAD,
      alreadyMentionedNextSquad: false,
    });
    expect(plan.decision.kind).toBe("refuse");
    expect(plan.requests).toEqual([]);
    expect(plan.comment).toBeNull();
  });

  it("previews nothing when the handoff was already performed", () => {
    const plan = planHandoff({
      fromPhase: 1,
      issue: { ...ISSUE, assignee_id: "owner-2" },
      summary: completeP1,
      reentry: OK,
      targetOwnerId: "owner-2",
      nextSquad: NEXT_SQUAD,
      alreadyMentionedNextSquad: true,
    });
    expect(plan.decision.kind).toBe("noop");
    expect(plan.requests).toEqual([]);
  });

  it("previews only the mention when the owner is already correct", () => {
    const plan = planHandoff({
      fromPhase: 1,
      issue: { ...ISSUE, assignee_id: "owner-2" },
      summary: completeP1,
      reentry: OK,
      targetOwnerId: "owner-2",
      nextSquad: NEXT_SQUAD,
      alreadyMentionedNextSquad: false,
    });
    expect(plan.requests).toHaveLength(1);
    expect(plan.requests[0]?.method).toBe("POST");
  });

  it("carries the re-entry refusal through untouched", () => {
    const plan = planHandoff({
      fromPhase: 1,
      issue: ISSUE,
      summary: completeP1,
      reentry: { allowed: false, reason: "active-task", detail: "WAIT — task t1 is running" },
      targetOwnerId: "owner-2",
      nextSquad: NEXT_SQUAD,
      alreadyMentionedNextSquad: false,
    });
    expect(plan.decision.kind).toBe("refuse");
    expect(plan.decision.reason).toContain("WAIT");
  });
});

describe("planTerminalReassign", () => {
  const base = {
    issue: { ...ISSUE, assignee_id: "owner-5" },
    summary: completeP5,
    reentry: OK,
    squad: { kind: "squad" as const, name: "aidlc-阶段五-运营", id: "squad-5" },
    checklistTicked: true,
    phaseSummaryPresent: true,
  };

  it("previews a squad assignment and warns about the authority it grants", () => {
    const plan = planTerminalReassign(base);
    expect(plan.decision.kind).toBe("run");
    expect(JSON.parse(plan.requests[0]?.body ?? "{}")).toEqual({
      assignee_type: "squad",
      assignee_id: "squad-5",
    });
    expect(plan.warnings.join(" ")).toContain("in_review");
    expect(plan.warnings.join(" ")).toContain("done remains yours");
  });

  it("previews nothing when the checklist is not ticked", () => {
    const plan = planTerminalReassign({ ...base, checklistTicked: false });
    expect(plan.decision.kind).toBe("refuse");
    expect(plan.requests).toEqual([]);
  });
});

describe("planFinalDone", () => {
  it("previews the status write from in_review", () => {
    const plan = planFinalDone({
      issue: { ...ISSUE, status: "in_review", assignee_type: "squad", assignee_id: "squad-5" },
      leaderCloseOutPresent: true,
      checklistTicked: true,
    });
    expect(plan.decision.kind).toBe("run");
    expect(JSON.parse(plan.requests[0]?.body ?? "{}")).toEqual({ status: "done" });
  });

  it("previews nothing from any other status", () => {
    const plan = planFinalDone({
      issue: { ...ISSUE, status: "todo" },
      leaderCloseOutPresent: true,
      checklistTicked: true,
    });
    expect(plan.decision.kind).toBe("refuse");
    expect(plan.requests).toEqual([]);
  });
});

describe("describePlan", () => {
  it("lists the wire traffic for a run", () => {
    const plan = planHandoff({
      fromPhase: 1,
      issue: ISSUE,
      summary: completeP1,
      reentry: OK,
      targetOwnerId: "owner-2",
      nextSquad: NEXT_SQUAD,
      alreadyMentionedNextSquad: false,
    });
    const lines = describePlan(plan);
    expect(lines).toEqual([
      "PUT /api/issues/issue-1",
      "POST /api/issues/issue-1/comments",
    ]);
  });

  it("explains a refusal instead", () => {
    const plan = planFinalDone({
      issue: ISSUE,
      leaderCloseOutPresent: false,
      checklistTicked: false,
    });
    expect(describePlan(plan)[0]).toContain("refused:");
  });
});
