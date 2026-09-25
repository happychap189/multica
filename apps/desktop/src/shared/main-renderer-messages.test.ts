// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  MainRendererMessageQueue,
  parseMainRendererChannelState,
  parseTabSelectionShortcutKey,
  TAB_SELECTION_SHORTCUT_CHANNEL,
} from "./main-renderer-messages";

describe("MainRendererMessageQueue per profile", () => {
  it("never flushes one profile's pending messages from another profile's readiness", () => {
    // One queue instance per desktop.json profile: profile B's main window
    // announcing readiness must not drain profile A's queued payloads.
    const queueA = new MainRendererMessageQueue();
    const queueB = new MainRendererMessageQueue();
    const sendA = vi.fn();
    const sendB = vi.fn();

    queueA.enqueue("auth:token", "token-for-a", sendA);
    queueB.setReady("auth:token", true, sendB);
    expect(sendA).not.toHaveBeenCalled();
    expect(sendB).not.toHaveBeenCalled();

    queueA.setReady("auth:token", true, sendA);
    expect(sendA).toHaveBeenCalledWith("auth:token", "token-for-a");
  });

  it("keeps readiness in other profiles' queues across a profile's readiness reset", () => {
    // The main process resets only the closing profile's queue; other
    // profiles' main windows keep delivering immediately.
    const queueA = new MainRendererMessageQueue();
    const queueB = new MainRendererMessageQueue();
    const sendA = vi.fn();
    const sendB = vi.fn();

    queueB.setReady("inbox:open", true, sendB);
    queueA.resetReady();
    queueB.enqueue("inbox:open", { itemId: "b-item" }, sendB);
    expect(sendB).toHaveBeenCalledOnce();

    queueA.enqueue("inbox:open", { itemId: "a-item" }, sendA);
    expect(sendA).not.toHaveBeenCalled();
  });
});

describe("MainRendererMessageQueue", () => {
  it("holds messages until their matching listener is ready", () => {
    const queue = new MainRendererMessageQueue();
    const send = vi.fn();

    queue.enqueue("auth:token", "token-a", send);
    queue.setReady("invite:open", true, send);
    expect(send).not.toHaveBeenCalled();

    queue.setReady("auth:token", true, send);
    expect(send).toHaveBeenCalledWith("auth:token", "token-a");
  });

  it("delivers immediately while a channel is ready", () => {
    const queue = new MainRendererMessageQueue();
    const send = vi.fn();

    queue.setReady("inbox:open", true, send);
    queue.enqueue("inbox:open", { itemId: "item-1" }, send);

    expect(send).toHaveBeenCalledOnce();
  });

  it("keeps queued work across a renderer readiness reset", () => {
    const queue = new MainRendererMessageQueue();
    const send = vi.fn();

    queue.setReady("invite:open", true, send);
    queue.resetReady();
    queue.enqueue("invite:open", "invite-1", send);
    expect(send).not.toHaveBeenCalled();

    queue.setReady("invite:open", true, send);
    expect(send).toHaveBeenCalledWith("invite:open", "invite-1");
  });

  it("can discard account-scoped pending messages", () => {
    const queue = new MainRendererMessageQueue();
    const send = vi.fn();

    queue.enqueue("inbox:open", { itemId: "old-account-item" }, send);
    queue.clear("inbox:open");
    queue.setReady("inbox:open", true, send);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("parseMainRendererChannelState", () => {
  it("accepts only allowlisted channels with an explicit boolean", () => {
    expect(
      parseMainRendererChannelState({ channel: "auth:token", ready: true }),
    ).toEqual({ channel: "auth:token", ready: true });
    expect(
      parseMainRendererChannelState({ channel: "shell:openExternal", ready: true }),
    ).toBeNull();
    expect(
      parseMainRendererChannelState({ channel: "auth:token", ready: "yes" }),
    ).toBeNull();
    expect(
      parseMainRendererChannelState({
        channel: TAB_SELECTION_SHORTCUT_CHANNEL,
        ready: true,
      }),
    ).toEqual({ channel: TAB_SELECTION_SHORTCUT_CHANNEL, ready: true });
  });
});

describe("parseTabSelectionShortcutKey", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])("accepts shortcut key %i", (key) => {
    expect(parseTabSelectionShortcutKey(key)).toBe(key);
  });

  it.each([0, 10, 1.5, "1", null, undefined])(
    "rejects invalid shortcut payload %j",
    (value) => {
      expect(parseTabSelectionShortcutKey(value)).toBeNull();
    },
  );
});
