// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { PhaseNumber } from "./phases";

import {
  PHASE_STAGE_COUNTS,
  PHASE_SUMMARY_SLUG,
  STAGES,
  TOTAL_SLOTS,
  nextSlugAfter,
  stageForSlot,
  stageForSlug,
} from "./stages";

const PHASES: readonly PhaseNumber[] = [1, 2, 3, 4, 5];

describe("the 33-stage table", () => {
  it("has exactly 33 slots", () => {
    expect(TOTAL_SLOTS).toBe(33);
    expect(STAGES).toHaveLength(33);
  });

  it("numbers ordinals 1..33 contiguously", () => {
    expect(STAGES.map((s) => s.ordinal)).toEqual(
      Array.from({ length: 33 }, (_, i) => i + 1),
    );
  });

  it("uses each slug exactly once", () => {
    const slugs = STAGES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("matches the protocol's per-phase stage counts 3/7/9/7/7", () => {
    for (const phase of PHASES) {
      const inPhase = STAGES.filter((s) => s.phase === phase);
      expect(inPhase).toHaveLength(PHASE_STAGE_COUNTS[phase]);
    }
  });

  it("numbers indexInPhase 1..n within each phase", () => {
    for (const phase of PHASES) {
      const indices = STAGES.filter((s) => s.phase === phase).map((s) => s.indexInPhase);
      expect(indices).toEqual(
        Array.from({ length: PHASE_STAGE_COUNTS[phase] }, (_, i) => i + 1),
      );
    }
  });

  it("keeps phases in ascending ordinal order", () => {
    expect(STAGES.map((s) => s.phase)).toEqual([
      ...Array<PhaseNumber>(3).fill(1),
      ...Array<PhaseNumber>(7).fill(2),
      ...Array<PhaseNumber>(9).fill(3),
      ...Array<PhaseNumber>(7).fill(4),
      ...Array<PhaseNumber>(7).fill(5),
    ]);
  });
});

describe("lookups", () => {
  it("finds a stage by slot", () => {
    expect(stageForSlot(3, 5)?.slug).toBe("reverse-engineering");
    expect(stageForSlot(1, 3)?.slug).toBe("workspace-scaffold");
  });

  it("returns undefined for an off-table slot", () => {
    expect(stageForSlot(1, 4)).toBeUndefined();
    expect(stageForSlot(6, 1)).toBeUndefined();
  });

  it("finds a stage by slug", () => {
    expect(stageForSlug("incident-response")?.ordinal).toBe(33);
  });
});

describe("nextSlugAfter", () => {
  it("advances within a phase", () => {
    expect(nextSlugAfter("state-init")).toBe("workspace-detection");
  });

  it("ends a phase at phase-summary", () => {
    expect(nextSlugAfter("workspace-scaffold")).toBe(PHASE_SUMMARY_SLUG);
    expect(nextSlugAfter("incident-response")).toBe(PHASE_SUMMARY_SLUG);
  });

  it("returns undefined for an unknown slug", () => {
    expect(nextSlugAfter("not-a-stage")).toBeUndefined();
  });
});
