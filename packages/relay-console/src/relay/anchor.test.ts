// @vitest-environment node

import { describe, expect, it } from "vitest";

import { findAnchor, parseAnchorLine, slotKey } from "./anchor";

describe("parseAnchorLine", () => {
  it("parses the canonical example from the protocol", () => {
    const anchor = parseAnchorLine("[P3 5/9] reverse-engineering done → next refined-mockups");
    expect(anchor).toMatchObject({
      phase: 3,
      indexInPhase: 5,
      stageCount: 9,
      slug: "reverse-engineering",
      revision: null,
      next: "refined-mockups",
    });
  });

  it("parses a rework re-issue", () => {
    const anchor = parseAnchorLine(
      "[P3 5/9] reverse-engineering done (r2) → next refined-mockups",
    );
    expect(anchor?.revision).toBe(2);
    expect(anchor?.slug).toBe("reverse-engineering");
    expect(anchor?.markerIsVariant).toBe(false);
  });

  it("accepts a non-protocol qualifier and flags it as a variant", () => {
    // Measured on the AIDL-3 run: the leader marked a CONDITIONAL stage `(skip)`
    // when its contract resolved to the greenfield branch. Rejecting the line
    // would drop a slot that exists and invent a "missing stage".
    const anchor = parseAnchorLine(
      "[P3 5/9] reverse-engineering done (skip) → next refined-mockups",
    );
    expect(anchor).not.toBeNull();
    expect(anchor?.slug).toBe("reverse-engineering");
    expect(anchor?.marker).toBe("skip");
    expect(anchor?.markerIsVariant).toBe(true);
    expect(anchor?.revision).toBeNull();
  });

  it("parses a phase-final anchor whose next is phase-summary", () => {
    const anchor = parseAnchorLine("[P1 3/3] workspace-scaffold done → next phase-summary");
    expect(anchor).toMatchObject({ phase: 1, indexInPhase: 3, next: "phase-summary" });
  });

  it("rejects a line with leading whitespace", () => {
    expect(parseAnchorLine("  [P1 1/3] state-init done → next workspace-detection")).toBeNull();
  });

  it("rejects an anchor embedded in prose", () => {
    expect(
      parseAnchorLine("the leader posted [P1 1/3] state-init done → next workspace-detection"),
    ).toBeNull();
  });

  it("rejects a missing `→ next` clause", () => {
    expect(parseAnchorLine("[P1 1/3] state-init done")).toBeNull();
  });

  it("rejects an uppercase slug", () => {
    expect(parseAnchorLine("[P1 1/3] State-Init done → next workspace-detection")).toBeNull();
  });

  it("rejects a phase outside 1..5", () => {
    expect(parseAnchorLine("[P6 1/3] state-init done → next workspace-detection")).toBeNull();
    expect(parseAnchorLine("[P0 1/3] state-init done → next workspace-detection")).toBeNull();
  });

  it("rejects meaningless rework revisions", () => {
    expect(parseAnchorLine("[P1 1/3] state-init done (r1) → next workspace-detection")).toBeNull();
    expect(parseAnchorLine("[P1 1/3] state-init done (r0) → next workspace-detection")).toBeNull();
  });

  it("rejects an ASCII arrow", () => {
    expect(parseAnchorLine("[P1 1/3] state-init done -> next workspace-detection")).toBeNull();
  });

  it("builds a slot key that collapses rework revisions", () => {
    const first = parseAnchorLine("[P1 1/3] state-init done → next workspace-detection");
    const rework = parseAnchorLine("[P1 1/3] state-init done (r2) → next workspace-detection");
    expect(first).not.toBeNull();
    expect(rework).not.toBeNull();
    if (first && rework) expect(slotKey(first)).toBe(slotKey(rework));
  });
});

describe("findAnchor", () => {
  it("finds an anchor in a body with a trailing newline", () => {
    expect(findAnchor("[P2 4/7] intent-capture done → next market-research\n")?.slug).toBe(
      "intent-capture",
    );
  });

  it("returns null for a body with no anchor", () => {
    expect(findAnchor("phase 交付摘要\n- 制品清单: …")).toBeNull();
  });

  it("returns the first anchor line when a body carries more than one", () => {
    const body = [
      "[P1 1/3] state-init done → next workspace-detection",
      "[P1 2/3] workspace-detection done → next workspace-scaffold",
    ].join("\n");
    expect(findAnchor(body)?.slug).toBe("state-init");
  });

  it("ignores prose around an anchor line", () => {
    const body = [
      "本 stage 已完成, 下面是锚:",
      "[P2 6/7] feasibility done → next rough-mockups",
      "",
      "请环节负责人核对。",
    ].join("\n");
    expect(findAnchor(body)?.slug).toBe("feasibility");
  });
});
