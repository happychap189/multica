// @vitest-environment node

import { describe, expect, it } from "vitest";

import { checkAuthorship } from "./authorship";

describe("checkAuthorship", () => {
  it("accepts a delivery authored by the dispatched persona", () => {
    const verdict = checkAuthorship({
      dispatchedPersona: "aidlc-developer",
      authorType: "agent",
      authorName: "aidlc-developer",
    });
    expect(verdict.status).toBe("ok");
  });

  it("flags a different agent as drift", () => {
    const verdict = checkAuthorship({
      dispatchedPersona: "aidlc-developer",
      authorType: "agent",
      authorName: "aidlc-quality",
    });
    expect(verdict.status).toBe("drifted");
    expect(verdict.detail).toContain("aidlc-quality");
    expect(verdict.detail).toContain("aidlc-developer");
  });

  it("flags a human or system author as drift", () => {
    expect(
      checkAuthorship({
        dispatchedPersona: "aidlc-developer",
        authorType: "member",
        authorName: "dev",
      }).status,
    ).toBe("drifted");
    expect(
      checkAuthorship({
        dispatchedPersona: "aidlc-developer",
        authorType: "system",
        authorName: null,
      }).status,
    ).toBe("drifted");
  });

  it("reports an unresolvable author as unknown, not as drift", () => {
    const verdict = checkAuthorship({
      dispatchedPersona: "aidlc-developer",
      authorType: "agent",
      authorName: null,
    });
    expect(verdict.status).toBe("unknown");
    expect(verdict.detail).toContain("not in the roster");
  });
});
