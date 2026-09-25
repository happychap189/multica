import type { DesktopConfigRegistry } from "../shared/runtime-config";

// Pure module — no Electron imports — because the app entry module registers
// app lifecycle handlers on import and cannot be loaded in the test
// environment (same constraint as window-profile-registry.ts).

/**
 * The profile a profile-less dispatch should target. The most recently
 * focused main window's profile wins; before any focus (or if that id no
 * longer exists in the config registry) the default profile is the answer.
 * Notification clicks and chord relays pass an explicit profile, which is
 * validated the same way and falls back identically when stale.
 */
export function resolveLastActiveProfileId(
  registry: DesktopConfigRegistry,
  lastFocusedProfileId: string | undefined,
): string {
  if (
    lastFocusedProfileId !== undefined &&
    lastFocusedProfileId in registry.profiles
  ) {
    return lastFocusedProfileId;
  }
  return registry.defaultProfile;
}
