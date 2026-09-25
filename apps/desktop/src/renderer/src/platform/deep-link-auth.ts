/**
 * Layers 2 and 3 of the deep-link safety net for multiple server profiles.
 *
 * An auth/callback deep link can be delivered to a window whose profile points
 * at a different server than the one that minted the token — Layer 1 (the
 * explicit login-intent registration in the main process) narrows that window
 * to a rare race, but cannot eliminate it. Before this wrapper existed, such a
 * misdelivery destroyed the target window's session: `loginWithToken`
 * overwrote the stored token, `/api/me` rejected it with 401, and the API
 * client's `handleUnauthorized` ran `sessionExpired()` — which unconditionally
 * clears the stored token, drops the workspace pointer, and tears down tabs,
 * overlays, and issue windows (see session-teardown.ts). The user lost a
 * healthy logged-in window to someone else's login.
 *
 * Layer 2 (probe-first) prevents that by validating the candidate token
 * against **this window's own server** before anything session-touching runs:
 * a raw `GET /api/me` fetch — deliberately not the ApiClient, whose 401
 * handler would fire `sessionExpired` and which would stamp workspace/CSRF
 * headers this probe must not send — carrying the candidate token as
 * `Authorization: Bearer` (`/api/me` rejects unauthenticated requests, so a
 * header-less probe would 401 for every token, valid or not). Four-state
 * semantics mirror the daemon's classifyAuthProbe (daemon-auth-probe.ts):
 *
 * - 2xx              → the token belongs to this server — run `loginWithToken`.
 * - 401              → the token belongs to another server. Touch nothing:
 *                      `loginWithToken` is never called, storage is untouched,
 *                      and the user is told to finish signing in from that
 *                      server's window.
 * - 5xx / timeout / network error → inconclusive ("unknown"): proceed with
 *   `loginWithToken` and let Layer 3 catch the failure. A non-401 failure
 *   never triggers sessionExpired, and a 401 that slips through (server
 *   flapped between probe and login) is what Layer 3 exists for.
 *
 * Layer 3 (rollback): if `loginWithToken` still fails, the pre-login state is
 * restored — token and user — the API client's token is re-pointed at the
 * restored credential, and the window reloads so bootstrapping re-hydrates
 * from the restored storage. The reload is the accepted loss: in-flight issue
 * windows and the tab layout do not survive it (session teardown resets tabs
 * irreversibly). Note that even when a misdirected login pierces both layers,
 * the local daemon is unaffected: it authenticates with its own PAT and
 * session expiry deliberately leaves it running (MUL-7028).
 *
 * Every side effect is injected (fetch, storages, reload, stores, notifier) so
 * the whole matrix is testable without a DOM or an Electron window.
 */
import type { User } from "@multica/core/types";

/** localStorage key the core auth store persists the session token under. */
const TOKEN_STORAGE_KEY = "multica_token";

/** sessionStorage key carrying the rollback notice across the Layer 3 reload. */
export const DEEP_LINK_ROLLBACK_NOTICE_KEY =
  "multica:deep-link-rollback-notice";

/** Shown (Layer 2) when a login callback belongs to a different server. */
export const WRONG_SERVER_NOTICE =
  "This login link belongs to a different server. Switch to that server's window to finish signing in.";

/** Shown (Layer 3, after the reload) when a login failed and state was rolled back. */
export const ROLLBACK_NOTICE =
  "This sign-in link could not be used here. Your previous session was restored.";

export type DeepLinkTokenVerdict = "ok" | "wrong_server" | "unknown";

export interface DeepLinkAuthDeps {
  /** This window's own API base URL, from the per-profile runtime config. */
  apiUrl: string;
  fetch: typeof fetch;
  /** localStorage — where the core auth store persists the session token. */
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  /** sessionStorage — carries the rollback notice across the Layer 3 reload. */
  session: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  reload: () => void;
  /** Layer 2 notification for the wrong-server verdict. */
  notifyWrongServer: () => void;
  loginWithToken: (token: string) => Promise<User>;
  setApiToken: (token: string | null) => void;
  getUser: () => User | null;
  setUser: (user: User) => void;
  /** Probe abort timeout. Defaults to 4s, matching the daemon's token probe. */
  probeTimeoutMs?: number;
}

/**
 * Classify the probe response, mirroring the daemon's classifyAuthProbe: only
 * an explicit 401 is an auth verdict; 5xx and everything else inconclusive.
 * 2xx means the token is valid on this server.
 */
function classifyProbeStatus(status: number): DeepLinkTokenVerdict {
  if (status === 401) return "wrong_server";
  if (status >= 200 && status < 300) return "ok";
  return "unknown";
}

async function probeDeepLinkToken(
  deps: DeepLinkAuthDeps,
  token: string,
): Promise<DeepLinkTokenVerdict> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    deps.probeTimeoutMs ?? 4_000,
  );
  try {
    const res = await deps.fetch(
      `${deps.apiUrl.replace(/\/+$/, "")}/api/me`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    );
    return classifyProbeStatus(res.status);
  } catch {
    // Timeout (abort), connection refused, DNS, TLS — inconclusive about auth.
    return "unknown";
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Restore the pre-login state after a failed `loginWithToken`. The token and
 * user snapshots are the whole memory of the window at that moment; the
 * workspace pointer and tab layout are deliberately not restored — the reload
 * re-picks them, and session teardown's `resetTabs` is irreversible (the
 * accepted loss described in the header comment).
 */
function restoreSnapshot(
  deps: DeepLinkAuthDeps,
  snapshot: { token: string | null; user: User | null },
): void {
  if (snapshot.token !== null) {
    deps.storage.setItem(TOKEN_STORAGE_KEY, snapshot.token);
  } else {
    deps.storage.removeItem(TOKEN_STORAGE_KEY);
  }
  deps.setApiToken(snapshot.token);
  if (snapshot.user) {
    deps.setUser(snapshot.user);
  }
}

/**
 * Handle one auth/callback deep-link token with Layer 2 probe + Layer 3
 * rollback. Returns whether the login completed, so the caller knows whether
 * to run the post-login steps (workspace list hydration).
 */
export async function handleDeepLinkAuthToken(
  deps: DeepLinkAuthDeps,
  token: string,
): Promise<boolean> {
  const verdict = await probeDeepLinkToken(deps, token);

  if (verdict === "wrong_server") {
    // Layer 2: this callback belongs to another server. Touch nothing — the
    // target window's healthy session stays exactly as it was.
    deps.notifyWrongServer();
    return false;
  }

  // ok / unknown: proceed under Layer 3 protection.
  const snapshot = {
    token: deps.storage.getItem(TOKEN_STORAGE_KEY),
    user: deps.getUser(),
  };

  try {
    await deps.loginWithToken(token);
    return true;
  } catch {
    // Layer 3: the login failed (typically a 401 that slipped through the
    // probe) and has already torn the session down via sessionExpired. Put
    // the pre-login state back, tell the user across the reload, and let
    // bootstrapping rebuild from the restored storage.
    restoreSnapshot(deps, snapshot);
    deps.session.setItem(DEEP_LINK_ROLLBACK_NOTICE_KEY, ROLLBACK_NOTICE);
    deps.reload();
    return false;
  }
}

/**
 * Read the pending rollback notice once and clear it, so it is shown exactly
 * once after the Layer 3 reload. Null when there is nothing pending.
 */
export function consumeDeepLinkRollbackNotice(
  session: Pick<Storage, "getItem" | "removeItem">,
): string | null {
  const message = session.getItem(DEEP_LINK_ROLLBACK_NOTICE_KEY);
  if (message === null) return null;
  session.removeItem(DEEP_LINK_ROLLBACK_NOTICE_KEY);
  return message;
}
