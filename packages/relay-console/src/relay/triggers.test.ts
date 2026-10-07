// @vitest-environment node

import { describe, expect, it } from "vitest";

import { buildMentionLiteral } from "./mentions";
import {
  describeVerdict,
  interpretTriggerOutcomes,
  isFailure,
  needsProbe,
} from "./triggers";

const SQUAD = {
  kind: "squad" as const,
  name: "aidlc-阶段二-构思",
  id: "6b68f1f8-fd67-49a4-9f9b-591ca231741c",
};

/** A comment body that carries a real mention — the case worth verifying. */
const MENTIONING = `按 relay-protocol.md 跑 ideation。${buildMentionLiteral(SQUAD)}`;
const PLAIN = "phase 交付摘要（零 mention）";

function outcome(status: string, reasonCode = "") {
  return {
    target_type: "squad",
    target_id: SQUAD.id,
    status,
    reason_code: reasonCode,
  };
}

describe("interpretTriggerOutcomes", () => {
  it("reports no-mentions when the body carries none", () => {
    const verdict = interpretTriggerOutcomes({ trigger_outcomes: [] }, PLAIN);
    expect(verdict.kind).toBe("no-mentions");
  });

  it("treats a missing field as unverified, never as success", () => {
    // The field is documented as create/edit-only and omitted by older servers.
    // Silence must not read as "the mention fired".
    const verdict = interpretTriggerOutcomes({ id: "c1", content: MENTIONING }, MENTIONING);
    expect(verdict.kind).toBe("unverified");
    expect(needsProbe(verdict)).toBe(true);
  });

  it("treats a non-array field as unverified", () => {
    expect(interpretTriggerOutcomes({ trigger_outcomes: null }, MENTIONING).kind).toBe(
      "unverified",
    );
    expect(interpretTriggerOutcomes({ trigger_outcomes: {} }, MENTIONING).kind).toBe(
      "unverified",
    );
  });

  it("treats an empty array on a mention-bearing comment as unverified", () => {
    // This is the silent-failure shape: HTTP 201, no outcomes, no tasks.
    const verdict = interpretTriggerOutcomes({ trigger_outcomes: [] }, MENTIONING);
    expect(verdict.kind).toBe("unverified");
    expect(needsProbe(verdict)).toBe(true);
  });

  it("accepts every whitelisted status", () => {
    for (const status of ["queued", "coalesced", "deferred", "steered"]) {
      const verdict = interpretTriggerOutcomes(
        { trigger_outcomes: [outcome(status)] },
        MENTIONING,
      );
      expect(verdict.kind).toBe("handled");
      expect(isFailure(verdict)).toBe(false);
    }
  });

  it("reports a blocked outcome as a failure with its reason code", () => {
    const verdict = interpretTriggerOutcomes(
      { trigger_outcomes: [outcome("blocked", "target_unavailable")] },
      MENTIONING,
    );
    expect(verdict.kind).toBe("unhandled");
    expect(isFailure(verdict)).toBe(true);
    if (verdict.kind === "unhandled") {
      expect(verdict.outcomes[0]?.reason_code).toBe("target_unavailable");
    }
  });

  it("treats an unrecognized status as a failure, not a success", () => {
    // Success is a whitelist: a status this build has never heard of must not
    // slip through as handled.
    const verdict = interpretTriggerOutcomes(
      { trigger_outcomes: [outcome("future_status")] },
      MENTIONING,
    );
    expect(verdict.kind).toBe("unhandled");
  });

  it("treats an outcome with an empty status as a failure", () => {
    const verdict = interpretTriggerOutcomes({ trigger_outcomes: [outcome("")] }, MENTIONING);
    expect(verdict.kind).toBe("unhandled");
  });

  it("drops a malformed entry without discarding the valid ones", () => {
    const verdict = interpretTriggerOutcomes(
      { trigger_outcomes: [outcome("queued"), { status: "queued" }] },
      MENTIONING,
    );
    expect(verdict.kind).toBe("handled");
    if (verdict.kind === "handled") expect(verdict.outcomes).toHaveLength(1);
  });

  it("reports unhandled when one of several outcomes is blocked", () => {
    const verdict = interpretTriggerOutcomes(
      { trigger_outcomes: [outcome("queued"), outcome("blocked", "runtime_offline")] },
      MENTIONING,
    );
    expect(verdict.kind).toBe("unhandled");
  });
});

describe("verdict helpers", () => {
  it("only unverified needs a probe", () => {
    expect(needsProbe({ kind: "handled", outcomes: [] })).toBe(false);
    expect(needsProbe({ kind: "unhandled", outcomes: [] })).toBe(false);
    expect(needsProbe({ kind: "no-mentions" })).toBe(false);
    expect(needsProbe({ kind: "unverified", reason: "x" })).toBe(true);
  });

  it("renders a one-line summary per verdict", () => {
    expect(describeVerdict({ kind: "no-mentions" })).toContain("no mention");
    expect(describeVerdict({ kind: "unverified", reason: "older build" })).toContain(
      "older build",
    );
    expect(describeVerdict({ kind: "handled", outcomes: [outcome("queued")] })).toContain(
      "handled",
    );
    expect(describeVerdict({ kind: "unhandled", outcomes: [outcome("blocked")] })).toContain(
      "NOT HANDLED",
    );
  });
});
