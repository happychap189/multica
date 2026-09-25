// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createWindowProfileRegistry,
  resolveRuntimeConfigForProfile,
  UNKNOWN_WINDOW_PROFILE_ERROR,
} from "./window-profile-registry";
import { DESKTOP_CONFIG_SCHEMA_VERSION } from "../shared/runtime-config";

const REGISTRY = {
  schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
  defaultProfile: "default",
  profiles: {
    default: { apiUrl: "https://default.example.com" },
    personal: { apiUrl: "https://personal.example.com" },
  },
};

describe("createWindowProfileRegistry", () => {
  it("returns the registered profile for a registered webContents id", () => {
    const registry = createWindowProfileRegistry();
    registry.register(1, "default");
    expect(registry.lookup(1)).toBe("default");
  });

  it("maps different senders to different profiles", () => {
    const registry = createWindowProfileRegistry();
    registry.register(1, "default");
    registry.register(2, "personal");
    expect(registry.lookup(1)).toBe("default");
    expect(registry.lookup(2)).toBe("personal");
  });

  it("unregister removes the mapping", () => {
    const registry = createWindowProfileRegistry();
    registry.register(1, "default");
    registry.unregister(1);
    expect(registry.lookup(1)).toBeUndefined();
  });

  it("unregister of an unknown id is a no-op", () => {
    const registry = createWindowProfileRegistry();
    expect(() => registry.unregister(99)).not.toThrow();
  });

  it("re-register overwrites the previous profile for the same sender", () => {
    const registry = createWindowProfileRegistry();
    registry.register(1, "default");
    registry.register(1, "personal");
    expect(registry.lookup(1)).toBe("personal");
  });

  it("fail-closed: an unregistered sender has no profile to fall back to", () => {
    const registry = createWindowProfileRegistry();
    expect(registry.lookup(404)).toBeUndefined();
  });
});

describe("resolveRuntimeConfigForProfile", () => {
  it("resolves the registered profile's own endpoints", () => {
    const result = resolveRuntimeConfigForProfile(REGISTRY, "personal");
    expect(result).toEqual({
      ok: true,
      config: {
        schemaVersion: 1,
        apiUrl: "https://personal.example.com",
        wsUrl: "wss://personal.example.com/ws",
        appUrl: "https://personal.example.com",
      },
    });
  });

  it("fail-closed for an unregistered sender — never falls back to default", () => {
    const result = resolveRuntimeConfigForProfile(REGISTRY, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(UNKNOWN_WINDOW_PROFILE_ERROR);
    }
  });

  it("fail-closed when the profile is missing from the config registry", () => {
    const result = resolveRuntimeConfigForProfile(REGISTRY, "ghost");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(UNKNOWN_WINDOW_PROFILE_ERROR);
    }
  });
});
