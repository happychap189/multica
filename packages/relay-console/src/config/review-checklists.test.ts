// @vitest-environment node

import { describe, expect, it } from "vitest";

import { PHASE_STAGE_COUNTS } from "./stages";
import type { PhaseNumber } from "./phases";

import {
  REVIEWER_ASSIGNMENTS,
  allChecklists,
  checklistFor,
  reviewersForPhase,
} from "./review-checklists";

const PHASES: readonly PhaseNumber[] = [1, 2, 3, 4, 5];

describe("reviewer assignments", () => {
  it("matches the counts the protocol's §4 checklists state", () => {
    // P1 none, P2 two advisory, P3 six advisory, P4 four adversarial, P5 none.
    expect(reviewersForPhase(1)).toHaveLength(0);
    expect(reviewersForPhase(2)).toHaveLength(2);
    expect(reviewersForPhase(3)).toHaveLength(6);
    expect(reviewersForPhase(4)).toHaveLength(4);
    expect(reviewersForPhase(5)).toHaveLength(0);
  });

  it("uses only the two declared modes", () => {
    for (const assignment of REVIEWER_ASSIGNMENTS) {
      expect(["advisory", "adversarial"]).toContain(assignment.mode);
    }
  });

  it("marks every phase-4 reviewer adversarial and every phase-3 one advisory", () => {
    expect(reviewersForPhase(4).every((a) => a.mode === "adversarial")).toBe(true);
    expect(reviewersForPhase(3).every((a) => a.mode === "advisory")).toBe(true);
  });

  it("names only the two reviewer personas", () => {
    for (const assignment of REVIEWER_ASSIGNMENTS) {
      expect(["aidlc-product-lead", "aidlc-architecture-reviewer"]).toContain(
        assignment.reviewer,
      );
    }
  });

  it("keeps ordinals in the 4..23 range the pack assigns reviewers to", () => {
    for (const assignment of REVIEWER_ASSIGNMENTS) {
      expect(assignment.ordinal).toBeGreaterThanOrEqual(4);
      expect(assignment.ordinal).toBeLessThanOrEqual(23);
    }
  });
});

describe("checklist shape", () => {
  it("produces one checklist per phase", () => {
    expect(allChecklists()).toHaveLength(5);
  });

  it("gives every checklist the same four segments in the protocol's order", () => {
    for (const phase of PHASES) {
      const checklist = checklistFor(phase);
      expect(checklist.segments.map((s) => s.id)).toEqual([
        "artifacts",
        "verdicts",
        "revisions",
        "hygiene",
      ]);
    }
  });

  it("uses the protocol's four segment headings", () => {
    // Asserts the exact strings: this is also the read-back check for the CJK
    // literals in this module.
    const titles = checklistFor(1).segments.map((s) => s.title);
    expect(titles).toEqual([
      "核心制品核对",
      "reviewer verdict 摘要核对",
      "附件修订号引用核对",
      "交接卫生项",
    ]);
  });

  it("never yields an empty segment", () => {
    for (const phase of PHASES) {
      for (const segment of checklistFor(phase).segments) {
        expect(segment.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every item a unique id within its checklist", () => {
    for (const phase of PHASES) {
      const ids = checklistFor(phase).segments.flatMap((s) => s.items.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("segment contents", () => {
  it("lists exactly the phase's stages under 核心制品核对", () => {
    for (const phase of PHASES) {
      const artifacts = checklistFor(phase).segments[0];
      expect(artifacts?.items).toHaveLength(PHASE_STAGE_COUNTS[phase]);
      expect(artifacts?.items.every((item) => item.stage !== undefined)).toBe(true);
    }
  });

  it("says so when a phase has no reviewer stage", () => {
    for (const phase of [1, 5] as const) {
      const verdicts = checklistFor(phase).segments[1];
      expect(verdicts?.items).toHaveLength(1);
      expect(verdicts?.items[0]?.label).toContain("no reviewer stage");
    }
  });

  it("lists one verdict item per reviewer in the other phases", () => {
    for (const phase of [2, 3, 4] as const) {
      expect(checklistFor(phase).segments[1]?.items).toHaveLength(
        reviewersForPhase(phase).length,
      );
    }
  });

  it("records the phase's stage count in the hygiene segment", () => {
    for (const phase of PHASES) {
      const hygiene = checklistFor(phase).segments[3];
      const anchorItem = hygiene?.items.find((item) => item.id === "hygiene:anchor-count");
      expect(anchorItem?.label).toContain(String(PHASE_STAGE_COUNTS[phase]));
    }
  });

  it("adds the terminal two-stage item to phase 5 only", () => {
    const has = (phase: PhaseNumber) =>
      checklistFor(phase).segments[3]?.items.some((i) => i.id === "hygiene:two-stage") ??
      false;
    expect(has(5)).toBe(true);
    expect(has(1)).toBe(false);
    expect(has(4)).toBe(false);
  });
});
