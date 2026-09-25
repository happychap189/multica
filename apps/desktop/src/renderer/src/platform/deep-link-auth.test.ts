// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@multica/core/types";

import {
  consumeDeepLinkRollbackNotice,
  handleDeepLinkAuthToken,
  DEEP_LINK_ROLLBACK_NOTICE_KEY,
  ROLLBACK_NOTICE,
  type DeepLinkAuthDeps,
} from "./deep-link-auth";

const OLD_TOKEN = "old-session-token";
const OLD_USER = { id: "user-1", name: "Old", email: "old@example.com" } as User;
const NEW_TOKEN = "new-token-from-deep-link";

function makeStorageSpy() {
  return {
    getItem: vi.fn<() => string | null>(() => null),
    setItem: vi.fn<(key: string, value: string) => void>(),
    removeItem: vi.fn<(key: string) => void>(),
  };
}

/** A fetch mock returning the given status; the probe only reads `.status`. */
function makeStatusFetch(status: number) {
  return vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      ({ status }) as Response,
  );
}

function makeDeps(overrides: Partial<DeepLinkAuthDeps> = {}) {
  const storage = makeStorageSpy();
  const session = makeStorageSpy();
  const fetch = makeStatusFetch(200);
  const reload = vi.fn();
  const notify = vi.fn();
  const loginWithToken = vi.fn(async () => OLD_USER);
  const setApiToken = vi.fn<(token: string | null) => void>();
  const getUser = vi.fn<() => User | null>(() => OLD_USER);
  const setUser = vi.fn<(user: User) => void>();

  const deps: DeepLinkAuthDeps = {
    apiUrl: "https://b.example.com",
    fetch: fetch as unknown as typeof fetch,
    storage,
    session,
    reload,
    notifyWrongServer: notify,
    loginWithToken,
    setApiToken,
    getUser,
    setUser,
    ...overrides,
  };

  return {
    deps,
    fetch,
    storage,
    session,
    reload,
    notify,
    loginWithToken,
    setApiToken,
    getUser,
    setUser,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleDeepLinkAuthToken", () => {
  it("sends the candidate token as a Bearer header to this window's /api/me", async () => {
    const h = makeDeps();
    await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(h.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe("https://b.example.com/api/me");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${NEW_TOKEN}`);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("strips trailing slashes from apiUrl before probing", async () => {
    const h = makeDeps({ apiUrl: "https://b.example.com///" });
    await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    const [url] = h.fetch.mock.calls[0];
    expect(url).toBe("https://b.example.com/api/me");
  });

  it("completes the login on a 2xx probe", async () => {
    const h = makeDeps();
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(completed).toBe(true);
    expect(h.loginWithToken).toHaveBeenCalledWith(NEW_TOKEN);
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });

  it("refuses a 401 probe without touching the session", async () => {
    const h = makeDeps({
      fetch: makeStatusFetch(401),
    });
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(h.loginWithToken).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.deps.storage.getItem).not.toHaveBeenCalled();
    expect(h.deps.storage.setItem).not.toHaveBeenCalled();
    expect(h.deps.storage.removeItem).not.toHaveBeenCalled();
    expect(completed).toBe(false);
  });

  it("proceeds with the login on a 5xx probe (unknown verdict)", async () => {
    const h = makeDeps({
      fetch: makeStatusFetch(500),
    });
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(completed).toBe(true);
    expect(h.loginWithToken).toHaveBeenCalledWith(NEW_TOKEN);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("proceeds with the login when the probe fetch throws", async () => {
    const h = makeDeps({
      fetch: vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) => {
          throw new Error("connection refused");
        },
      ),
    });
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(completed).toBe(true);
    expect(h.loginWithToken).toHaveBeenCalledWith(NEW_TOKEN);
  });

  it("proceeds with the login when the probe times out", async () => {
    // A fetch that never settles on its own — only the abort signal unblocks
    // it, proving the probe's timeout is what lets the handler proceed.
    const hangingFetch = ((_url: unknown, init?: { signal?: AbortSignal }) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      })) as unknown as typeof fetch;
    const h = makeDeps({
      fetch: hangingFetch,
      probeTimeoutMs: 5,
    });
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(completed).toBe(true);
    expect(h.loginWithToken).toHaveBeenCalledWith(NEW_TOKEN);
  });

  it("rolls back storage, api token, and user, then reloads when login fails", async () => {
    const h = makeDeps();
    h.storage.getItem.mockReturnValue(OLD_TOKEN);
    h.getUser.mockReturnValue(OLD_USER);
    h.loginWithToken.mockRejectedValue(new Error("401"));
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(completed).toBe(false);
    expect(h.storage.setItem).toHaveBeenCalledWith("multica_token", OLD_TOKEN);
    expect(h.setApiToken).toHaveBeenCalledWith(OLD_TOKEN);
    expect(h.setUser).toHaveBeenCalledWith(OLD_USER);
    expect(h.session.setItem).toHaveBeenCalledWith(
      DEEP_LINK_ROLLBACK_NOTICE_KEY,
      ROLLBACK_NOTICE,
    );
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("removes the token and skips the user restore for a logged-out window", async () => {
    const h = makeDeps();
    h.storage.getItem.mockReturnValue(null);
    h.getUser.mockReturnValue(null);
    h.loginWithToken.mockRejectedValue(new Error("401"));
    await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(h.storage.removeItem).toHaveBeenCalledWith("multica_token");
    expect(h.setApiToken).toHaveBeenCalledWith(null);
    expect(h.setUser).not.toHaveBeenCalled();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("writes no rollback notice when the login succeeds", async () => {
    const h = makeDeps();
    h.storage.getItem.mockReturnValue(OLD_TOKEN);
    h.getUser.mockReturnValue(OLD_USER);
    const completed = await handleDeepLinkAuthToken(h.deps, NEW_TOKEN);

    expect(completed).toBe(true);
    expect(h.session.setItem).not.toHaveBeenCalled();
    expect(h.reload).not.toHaveBeenCalled();
  });
});

describe("consumeDeepLinkRollbackNotice", () => {
  it("returns and clears the pending notice exactly once", () => {
    const session = makeStorageSpy();
    session.getItem.mockReturnValue(ROLLBACK_NOTICE);

    expect(consumeDeepLinkRollbackNotice(session)).toBe(ROLLBACK_NOTICE);
    session.getItem.mockReturnValue(null);
    expect(consumeDeepLinkRollbackNotice(session)).toBeNull();
    expect(session.removeItem).toHaveBeenCalledWith(
      DEEP_LINK_ROLLBACK_NOTICE_KEY,
    );
  });

  it("returns null when nothing is pending", () => {
    const session = makeStorageSpy();
    expect(consumeDeepLinkRollbackNotice(session)).toBeNull();
  });
});
