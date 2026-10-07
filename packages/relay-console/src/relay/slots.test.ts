// @vitest-environment node

import { describe, expect, it } from "vitest";

import { PHASE_STAGE_COUNTS, STAGES, nextSlugAfter } from "../config/stages";

import { parseAnchorLine } from "./anchor";
import { isPhaseComplete, summarizeSlots, type AnchorOccurrence } from "./slots";

let clock = 0;

function at(): string {
  clock += 1;
  return new Date(Date.UTC(2026, 9, 4, 0, 0, clock)).toISOString();
}

function occurrence(
  line: string,
  options: { isReply?: boolean; id?: string } = {},
): AnchorOccurrence {
  const anchor = parseAnchorLine(line);
  if (!anchor) throw new Error(`fixture is not an anchor: ${line}`);
  return {
    anchor,
    commentId: options.id ?? `c${clock}`,
    createdAt: at(),
    isReply: options.isReply ?? false,
  };
}

/** The anchor line each slot would carry, derived from the stage table. */
function anchorLineFor(ordinal: number): string {
  const stage = STAGES[ordinal - 1];
  if (!stage) throw new Error(`no stage at ordinal ${ordinal}`);
  return `[P${stage.phase} ${stage.indexInPhase}/${PHASE_STAGE_COUNTS[stage.phase]}] ${stage.slug} done → next ${nextSlugAfter(stage.slug)}`;
}

function fullRelay(): AnchorOccurrence[] {
  return STAGES.map((stage) => occurrence(anchorLineFor(stage.ordinal)));
}

describe("summarizeSlots", () => {
  it("counts a complete relay as 33 filled slots with no anomalies", () => {
    const summary = summarizeSlots(fullRelay());
    expect(summary.uniqueCount).toBe(33);
    expect(summary.filledByPhase).toEqual({ 1: 3, 2: 7, 3: 9, 4: 7, 5: 7 });
    expect(summary.anomalies).toEqual([]);
  });

  it("reports the latest anchor as `last`", () => {
    const summary = summarizeSlots(fullRelay());
    expect(summary.last?.anchor.slug).toBe("incident-response");
  });

  it("collapses a rework re-issue into its slot", () => {
    const summary = summarizeSlots([
      occurrence("[P3 5/9] reverse-engineering done → next refined-mockups"),
      occurrence("[P3 5/9] reverse-engineering done (r2) → next refined-mockups"),
    ]);
    expect(summary.uniqueCount).toBe(1);
    expect(summary.slots[0]?.occurrences).toBe(2);
    expect(summary.slots[0]?.revisions).toEqual([2]);
    expect(summary.anomalies).toEqual([]);
  });

  it("flags a repeat with no rework marker as revision drift", () => {
    const summary = summarizeSlots([
      occurrence("[P3 5/9] reverse-engineering done → next refined-mockups"),
      occurrence("[P3 5/9] reverse-engineering done → next refined-mockups"),
    ]);
    expect(summary.uniqueCount).toBe(1);
    expect(summary.slots[0]?.duplicatedWithoutRevision).toBe(true);
    expect(summary.anomalies.join("\n")).toContain("no rework marker");
  });

  it("counts a non-protocol marker's slot and flags the marker as a variant", () => {
    const summary = summarizeSlots([
      occurrence("[P3 5/9] reverse-engineering done (skip) → next refined-mockups"),
    ]);
    expect(summary.uniqueCount).toBe(1);
    expect(summary.slots[0]?.variants).toEqual(["skip"]);
    expect(summary.slots[0]?.duplicatedWithoutRevision).toBe(false);
    expect(summary.anomalies.join("\n")).toContain("non-protocol anchor marker");
  });

  it("counts anchors posted as thread replies", () => {
    const summary = summarizeSlots([
      occurrence("[P5 1/7] environment-provisioning done → next deployment-pipeline", {
        isReply: true,
      }),
    ]);
    expect(summary.uniqueCount).toBe(1);
    expect(summary.filledByPhase[5]).toBe(1);
  });

  it("flags a slug that does not match its slot in the table", () => {
    // Table says P4 slot 4 is `infrastructure-design`.
    const summary = summarizeSlots([
      occurrence("[P4 4/7] contract-design done → next code-generation"),
    ]);
    expect(summary.slots[0]?.slugMatchesTable).toBe(false);
    expect(summary.slots[0]?.expectedSlug).toBe("infrastructure-design");
    expect(summary.anomalies.join("\n")).toContain("table expects");
  });

  it("flags a slot the table does not define", () => {
    const summary = summarizeSlots([
      occurrence("[P1 4/3] state-init done → next workspace-detection"),
    ]);
    expect(summary.slots[0]?.expectedSlug).toBeNull();
    expect(summary.anomalies.join("\n")).toContain("no stage occupies this slot");
  });

  it("treats a consistent alternative denominator as a reduced path, not drift", () => {
    // Measured on AIDL-17: a profile-entry run declared `[P2 i/4]`. Protocol
    // §3.5 defines `{n}` as the current run's stage count, so comparing it
    // against full-33 would flag 11 of the 16 squads on every run.
    const summary = summarizeSlots([
      occurrence("[P2 1/4] intent-capture done → next feasibility"),
      occurrence("[P2 2/4] feasibility done → next rough-mockups"),
    ]);
    expect(summary.anomalies).toEqual([]);
    expect(summary.notes.join("\n")).toContain("reduced path");
    expect(summary.observedPhaseCounts[2]).toBe(4);
  });

  it("flags a slot whose slug disagrees under a reduced path only via its own count", () => {
    // Under a reduced path the table comparison is skipped, so an unfamiliar
    // slug is not reported — the path, not the table, defines the slots.
    const summary = summarizeSlots([
      occurrence("[P2 1/4] intent-capture done → next feasibility"),
      occurrence("[P2 2/4] feasibility done → next rough-mockups"),
    ]);
    expect(summary.slots.every((slot) => slot.phaseCountMismatch)).toBe(true);
    expect(summary.anomalies).toEqual([]);
  });

  it("flags anchors in one phase that disagree on their denominator", () => {
    const summary = summarizeSlots([
      occurrence("[P2 1/4] intent-capture done → next feasibility"),
      occurrence("[P2 2/7] feasibility done → next rough-mockups"),
    ]);
    expect(summary.anomalies.join("\n")).toContain("disagree on their stage count");
  });

  it("treats identical timestamps as later-input-wins for `last`", () => {
    const first = occurrence("[P1 1/3] state-init done → next workspace-detection");
    const second = occurrence("[P1 2/3] workspace-detection done → next workspace-scaffold");
    const sameStamp = first.createdAt;
    const summary = summarizeSlots([first, { ...second, createdAt: sameStamp }]);
    expect(summary.last?.anchor.slug).toBe("workspace-detection");
  });

  it("returns an empty summary for a timeline with no anchors", () => {
    const summary = summarizeSlots([]);
    expect(summary.uniqueCount).toBe(0);
    expect(summary.last).toBeNull();
    expect(summary.anomalies).toEqual([]);
  });
});

describe("isPhaseComplete", () => {
  it("is true only once every slot in the phase is filled", () => {
    const partial = summarizeSlots([occurrence(anchorLineFor(1))]);
    expect(isPhaseComplete(partial, 1)).toBe(false);
    const complete = summarizeSlots(fullRelay());
    expect(isPhaseComplete(complete, 1)).toBe(true);
    expect(isPhaseComplete(complete, 5)).toBe(true);
  });
});
