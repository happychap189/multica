// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createLoginIntentRegistry,
  LOGIN_INTENT_TTL_MS,
} from "./deep-link-registry";

const NOW = 1_000_000;

describe("createLoginIntentRegistry", () => {
  it("exposes a TTL of at least 10 minutes", () => {
    expect(LOGIN_INTENT_TTL_MS).toBeGreaterThanOrEqual(10 * 60 * 1000);
  });

  it("delivers the registered profile to the first consume in the auth callback", () => {
    const registry = createLoginIntentRegistry();
    registry.register("personal", NOW);

    expect(registry.consume(NOW + 1)).toBe("personal");
    // One-shot: the slot is spent by the first callback.
    expect(registry.consume(NOW + 2)).toBeUndefined();
  });

  it("returns undefined for a consume with nothing registered", () => {
    const registry = createLoginIntentRegistry();
    expect(registry.consume(NOW)).toBeUndefined();
  });

  it("expires the registration after the TTL", () => {
    const registry = createLoginIntentRegistry();
    registry.register("personal", NOW);
    // Exactly at the TTL edge the record is already stale.
    expect(registry.consume(NOW + LOGIN_INTENT_TTL_MS)).toBeUndefined();
  });

  it("consumes exactly once even when the record expired", () => {
    const registry = createLoginIntentRegistry();
    registry.register("personal", NOW);
    expect(registry.consume(NOW + LOGIN_INTENT_TTL_MS)).toBeUndefined();
    // The expired consume still spent the slot.
    expect(registry.consume(NOW + LOGIN_INTENT_TTL_MS + 1)).toBeUndefined();
  });

  it("overwrites an earlier registration (last-writer-wins)", () => {
    const registry = createLoginIntentRegistry();
    registry.register("work", NOW);
    registry.register("personal", NOW + 5);
    expect(registry.consume(NOW + 6)).toBe("personal");
  });
});
