// @vitest-environment node
import { describe, expect, it } from "vitest";
import { resolveLastActiveProfileId } from "./last-active-profile";
import { DESKTOP_CONFIG_SCHEMA_VERSION } from "../shared/runtime-config";

const REGISTRY = {
  schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
  defaultProfile: "default",
  profiles: {
    default: { apiUrl: "https://default.example.com" },
    personal: { apiUrl: "https://personal.example.com" },
  },
};

describe("resolveLastActiveProfileId", () => {
  it("returns the last focused profile while it still exists in the registry", () => {
    expect(resolveLastActiveProfileId(REGISTRY, "personal")).toBe("personal");
    expect(resolveLastActiveProfileId(REGISTRY, "default")).toBe("default");
  });

  it("falls back to the default profile before any window has been focused", () => {
    expect(resolveLastActiveProfileId(REGISTRY, undefined)).toBe("default");
  });

  it("falls back to the default profile when the focused id is stale", () => {
    expect(resolveLastActiveProfileId(REGISTRY, "ghost")).toBe("default");
  });
});
