import type { Session } from "electron";

// Sessions whose WebSocket upgrade requests already have the Origin header
// stripped, so the server's origin whitelist never rejects WS connections.
// WeakSet so a torn-down session can be garbage-collected while the guard
// entry disappears with it.
const originStrippedSessions = new WeakSet<Session>();

/**
 * Strip the Origin header from WebSocket upgrade requests on this session, so
 * the server's origin whitelist doesn't reject connections from localhost dev
 * origins. Extracted from index.ts: non-default profiles run in their own
 * `persist:` partition, which is a fresh Session object — without this, only
 * the default session was covered and profile-B WS upgrades would be rejected.
 *
 * Installing per window stays safe whatever Electron's webRequest listener
 * semantics are (append or replace): the WeakSet guard keeps installation to
 * exactly one listener per Session, and even without the guard the handler is
 * idempotent (it always removes the same header). Windows sharing a
 * partition (main window + issue windows) share one Session object.
 */
export function installOriginStrip(session: Session): void {
  if (originStrippedSessions.has(session)) return;
  originStrippedSessions.add(session);
  session.webRequest.onBeforeSendHeaders(
    { urls: ["wss://*/*", "ws://*/*"] },
    (details, callback) => {
      delete details.requestHeaders["Origin"];
      callback({ requestHeaders: details.requestHeaders });
    },
  );
}
