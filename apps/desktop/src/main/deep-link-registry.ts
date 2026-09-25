// Pure module — no Electron imports — because the app entry module registers
// app lifecycle handlers on import and cannot be loaded in the test
// environment (same constraint as window-profile-registry.ts).

/**
 * Layer 1 of the deep-link safety net for multiple server profiles: the
 * profile that opens the browser to start a login registers its intent here,
 * and the `multica://auth/callback` deep link consumes that registration
 * before any fallback, so the token lands in the window that asked for it.
 *
 * Only an explicit login intent creates a registration: the login page's
 * `openExternal(url, { intent: "login" })` call. Everyday external-link
 * traffic — issue content links, changelog links — flows through the same
 * `shell:openExternal` IPC and must not evict a pending registration, which
 * is why routing never URL-prefix-matches and trusts the explicit intent
 * instead.
 *
 * The slot is single and one-shot. A consumed registration — by the callback
 * it was registered for, or after expiry — is gone, so a stale slot can
 * never steer a later, unrelated callback.
 *
 * The TTL covers the whole out-of-app detour: Google OAuth account picking
 * plus two-factor authentication can take minutes, so 10 minutes replaces
 * the "a few seconds" a plain redirect would need. An expired (or absent)
 * registration degrades routing to last-focused/default, where Layer 2 (the
 * renderer's token probe) and Layer 3 (state rollback) still protect the
 * target window.
 *
 * Two profiles starting logins concurrently overwrite each other
 * (last-writer-wins). The overwritten window's callback is then caught by
 * Layer 2's probe — a 401 from its own server — and the user signs in
 * again. An accepted, recoverable degradation.
 */

export const LOGIN_INTENT_TTL_MS = 10 * 60 * 1000;

export interface LoginIntentRegistry {
  register(profileId: string, now: number): void;
  /**
   * Returns the registered profile when one is on record and within TTL.
   * Always clears the slot, whether or not the record was still valid.
   */
  consume(now: number): string | undefined;
}

export function createLoginIntentRegistry(
  ttlMs: number = LOGIN_INTENT_TTL_MS,
): LoginIntentRegistry {
  let pending: { profileId: string; registeredAt: number } | undefined;
  return {
    register(profileId, now) {
      // Last-writer-wins for concurrent logins from two profiles — the
      // accepted degradation described above.
      pending = { profileId, registeredAt: now };
    },
    consume(now) {
      const record = pending;
      pending = undefined;
      if (!record) return undefined;
      if (now - record.registeredAt >= ttlMs) return undefined;
      return record.profileId;
    },
  };
}
