import {
  resolveProfileRuntimeConfig,
  type DesktopConfigRegistry,
  type RuntimeConfigResult,
} from "../shared/runtime-config";

// Maps each live renderer's webContents id to the desktop.json profile it
// belongs to. Pure module — no Electron imports — because the app entry
// module registers app lifecycle handlers on import and cannot be loaded in
// the test environment (same constraint as renderer-web-preferences.ts).
export interface WindowProfileRegistry {
  register(webContentsId: number, profileId: string): void;
  unregister(webContentsId: number): void;
  // Undefined for an unregistered sender — the fail-closed signal consumed by
  // the runtime-config:get handler (never fall back to another profile).
  lookup(webContentsId: number): string | undefined;
}

export function createWindowProfileRegistry(): WindowProfileRegistry {
  const profiles = new Map<number, string>();
  return {
    register(webContentsId, profileId) {
      profiles.set(webContentsId, profileId);
    },
    unregister(webContentsId) {
      profiles.delete(webContentsId);
    },
    lookup(webContentsId) {
      return profiles.get(webContentsId);
    },
  };
}

export const UNKNOWN_WINDOW_PROFILE_ERROR = "unknown window profile";

// Resolve the runtime config a specific window should receive, purely from
// its registered profile. An unregistered sender (or a profile that no longer
// exists in the registry) is fail-closed: the blocking error shape consumed by
// the renderer's config-error UI — never another profile's endpoints.
export function resolveRuntimeConfigForProfile(
  registry: DesktopConfigRegistry,
  profileId: string | undefined,
): RuntimeConfigResult {
  if (!profileId) {
    return { ok: false, error: { message: UNKNOWN_WINDOW_PROFILE_ERROR } };
  }
  try {
    return { ok: true, config: resolveProfileRuntimeConfig(registry, profileId) };
  } catch {
    return { ok: false, error: { message: UNKNOWN_WINDOW_PROFILE_ERROR } };
  }
}
