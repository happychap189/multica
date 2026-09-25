// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { installOriginStrip } from "./origin-strip";

// Minimal fake of the Session.webRequest surface installOriginStrip touches.
function fakeSession() {
  const onBeforeSendHeaders = vi.fn();
  return {
    webRequest: { onBeforeSendHeaders },
    onBeforeSendHeaders,
  };
}

describe("installOriginStrip", () => {
  it("registers exactly one onBeforeSendHeaders listener", () => {
    const session = fakeSession();
    installOriginStrip(session as never);
    expect(session.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
  });

  it("is idempotent per Session — a second install is a no-op", () => {
    const session = fakeSession();
    installOriginStrip(session as never);
    installOriginStrip(session as never);
    installOriginStrip(session as never);
    expect(session.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
  });

  it("installs on a second session independently (fresh partition session)", () => {
    const a = fakeSession();
    const b = fakeSession();
    installOriginStrip(a as never);
    installOriginStrip(b as never);
    expect(a.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
    expect(b.onBeforeSendHeaders).toHaveBeenCalledTimes(1);
  });

  it("the installed listener strips Origin and always invokes the callback", () => {
    const session = fakeSession();
    installOriginStrip(session as never);
    const [, listener] = session.onBeforeSendHeaders.mock.calls[0];
    const callback = vi.fn();
    listener(
      { requestHeaders: { Origin: "http://localhost:3000", Cookie: "keep" } },
      callback,
    );
    expect(callback).toHaveBeenCalledWith({
      requestHeaders: { Cookie: "keep" },
    });
  });

  it("scopes the listener to WebSocket upgrade URLs", () => {
    const session = fakeSession();
    installOriginStrip(session as never);
    const [filter] = session.onBeforeSendHeaders.mock.calls[0];
    expect(filter).toEqual({ urls: ["wss://*/*", "ws://*/*"] });
  });
});
