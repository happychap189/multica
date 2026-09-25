// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFile, type ChildProcess } from "child_process";

// Mutable per-test state for the fs/promises mock (hoisted so the factory can
// read it at call time, not import time).
const state = vi.hoisted(() => ({
  profileConfigToken: undefined as string | undefined,
}));

vi.mock("fs/promises", () => ({
  // No profile config exists unless a test plants a token in it.
  readFile: vi.fn(async (path: unknown) => {
    if (state.profileConfigToken && String(path).endsWith("config.json")) {
      return JSON.stringify({ token: state.profileConfigToken });
    }
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  }),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rm: vi.fn(async () => undefined),
  open: vi.fn(async () => {
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  }),
  stat: vi.fn(async () => {
    throw Object.assign(new Error("not found"), { code: "ENOENT" });
  }),
}));

// execFile is invoked as (file, args, options, callback); tests resolve the
// pending callback to simulate CLI outcomes.
vi.mock("child_process", () => ({ execFile: vi.fn() }));

import {
  AUTH_PROBE_GRACE_MS,
  DaemonManagerInstance,
  POLL_INTERVAL_MS,
  type DaemonStatusWindow,
} from "./daemon-manager-instance";
import { healthPortForProfile } from "./daemon-profile";
import { writeFile } from "fs/promises";

const execFileMock = vi.mocked(execFile);

// The daemon OS value that matches this host (normalizeHostOS vocabulary), so
// health payloads count as a natively-manageable daemon on any platform.
const HOST_OS = process.platform === "win32" ? "windows" : process.platform;

interface SentMessage {
  channel: string;
  payload: unknown;
}

const HOST_A = "https://a.example.com";
const HOST_B = "https://b.example.com";
const PROFILE_A = "desktop-a.example.com";
const PROFILE_B = "desktop-b.example.com";

function fakeWindow() {
  const sent: SentMessage[] = [];
  const window: DaemonStatusWindow = {
    webContents: {
      send(channel: string, payload?: unknown) {
        sent.push({ channel, payload });
      },
    },
  };
  return { sent, window };
}

function stubResolver(bin: string | null = "/fake/multica") {
  return {
    resolve: vi.fn(async () => bin),
    getVersion: vi.fn(async () => "1.0.0"),
    resetForRetryInstall: vi.fn(),
  };
}

function makeInstance(label: string) {
  const { sent, window } = fakeWindow();
  const cliResolver = stubResolver();
  const instance = new DaemonManagerInstance({
    windowForProfile: () => window,
    cliResolver,
  });
  return { label, sent, cliResolver, instance };
}

function statusPayloads(sent: SentMessage[]): Array<Record<string, unknown>> {
  return sent
    .filter((m) => m.channel === "daemon:status")
    .map((m) => m.payload as Record<string, unknown>);
}

function health(port: number): string {
  return `http://127.0.0.1:${port}/health`;
}

const PORT_A = healthPortForProfile(PROFILE_A);
const PORT_B = healthPortForProfile(PROFILE_B);

function lastExecCallback(): (err: Error | null) => void {
  const call = execFileMock.mock.calls.at(-1) as unknown as [
    string,
    string[],
    object,
    (err: Error | null) => void,
  ];
  return call[3];
}

// Controllable global fetch: each call is recorded with its URL for
// per-profile assertions; tests control responses via the mock.
const fetchMock = vi.fn<(input: unknown, init?: unknown) => Promise<Response>>(
  async () => undefined as unknown as Response,
);
const fetchCalls = () => fetchMock.mock.calls.map((args) => String(args[0]));

function respond(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "test",
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as unknown as Response;
}

beforeEach(() => {
  state.profileConfigToken = undefined;
  execFileMock.mockClear();
  execFileMock.mockImplementation(
    (() => undefined) as unknown as () => ChildProcess,
  );
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  vi.useFakeTimers();
  // Deterministic "now" for recovery-policy observations.
  vi.setSystemTime(1_000);
});

function drain(): Promise<unknown> {
  return vi.advanceTimersByTimeAsync(0);
}

describe("DaemonManagerInstance per-profile isolation", () => {
  // Regression guard for the multi-profile daemon deadlock: with a shared
  // operation gate, a busy gate could discard the second profile's bootstrap
  // (runBackground busy-drop), and installing_cli short-circuits health
  // polling — so the second profile stuck in "Setting up…" forever.
  it("bootstraps each profile out of installing_cli and starts its own poll loop", async () => {
    const a = makeInstance("a");
    const b = makeInstance("b");

    a.instance.bootstrap();
    b.instance.bootstrap();
    expect(statusPayloads(a.sent)).toEqual([
      { state: "installing_cli" },
    ]);
    expect(statusPayloads(b.sent)).toEqual([
      { state: "installing_cli" },
    ]);
    await drain();

    // Each instance's own gate ran its bootstrap to completion: the CLI
    // resolved, the state machine went to "stopped" (bootstrapCli), and its
    // own poll loop's first tick also reported "stopped" — per instance.
    expect(statusPayloads(a.sent)).toEqual([
      { state: "installing_cli" },
      { state: "stopped" },
      { state: "stopped" },
    ]);
    expect(statusPayloads(b.sent)).toEqual([
      { state: "installing_cli" },
      { state: "stopped" },
      { state: "stopped" },
    ]);
  });

  it("stops one profile's poll timer via prepareForQuit without touching another profile's", async () => {
    const a = makeInstance("a");
    const b = makeInstance("b");
    a.instance.bootstrap();
    b.instance.bootstrap();
    await drain();

    a.instance.prepareForQuit();
    const aCount = a.sent.length;
    const bCountAtQuit = b.sent.length;

    // Two poll ticks: B keeps reporting, A stays frozen.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(a.sent.length).toBe(aCount);
    expect(b.sent.length).toBeGreaterThan(bCountAtQuit);

    b.instance.prepareForQuit();
    const bCount = b.sent.length;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(b.sent.length).toBe(bCount);
  });

  // Regression guard for per-profile gates: with a SHARED gate, A's long
  // daemon:start marks lifecycleBusy for B, which resets B's consecutive
  // stopped count and delays B's crash recovery by the full op duration.
  it("keeps B's recovery eligibility while A's gate is busy", async () => {
    const a = makeInstance("a");
    const b = makeInstance("b");
    a.instance.bootstrap();
    b.instance.bootstrap();
    await drain();

    // A: a lifecycle op that stays in flight on its own gate.
    await a.instance.setTargetApiUrl(HOST_A);
    const startedA = a.instance.start();
    await drain();

    // B: complete its own start; its gate is idle afterwards.
    await b.instance.setTargetApiUrl(HOST_B);
    const startedB = b.instance.start();
    await drain();
    lastExecCallback()(null);
    await expect(startedB).resolves.toEqual({ success: true });
    await drain();

    // While A's gate is busy, A never confirms recovery...
    for (let i = 0; i < 6; i += 1) {
      expect(a.instance.recoveryDecision({ state: "stopped" })).toBe("none");
    }
    // ...but B (idle gate, desired running) confirms after three misses.
    expect(b.instance.recoveryDecision({ state: "stopped" })).toBe("none");
    expect(b.instance.recoveryDecision({ state: "stopped" })).toBe("none");
    expect(b.instance.recoveryDecision({ state: "stopped" })).toBe("confirm");

    // Once A's start completes, A regains eligibility too.
    (execFileMock.mock.calls[0] as unknown as [
      string,
      string[],
      object,
      (err: Error | null) => void,
    ])[3](null);
    await expect(startedA).resolves.toEqual({ success: true });
    await drain();
    const aDecisions = [
      a.instance.recoveryDecision({ state: "stopped" }),
      a.instance.recoveryDecision({ state: "stopped" }),
      a.instance.recoveryDecision({ state: "stopped" }),
    ];
    expect(aDecisions).toContain("confirm");
  });
});

describe("DaemonManagerInstance per-profile targets", () => {
  it("probes its own profile's health port and reports its own profile name", async () => {
    const a = makeInstance("a");
    const b = makeInstance("b");
    a.instance.bootstrap();
    b.instance.bootstrap();
    await drain();
    await a.instance.setTargetApiUrl(HOST_A);
    await b.instance.setTargetApiUrl(HOST_B);

    const aStatus = await a.instance.fetchHealth();
    expect(fetchCalls()).toContain(health(PORT_A));
    expect(aStatus.profile).toBe(PROFILE_A);

    const bStatus = await b.instance.fetchHealth();
    expect(fetchCalls()).toContain(health(PORT_B));
    expect(bStatus.profile).toBe(PROFILE_B);
  });

  it("mints the PAT at its own target and writes server_url back to its own config", async () => {
    const a = makeInstance("a");
    const b = makeInstance("b");
    a.instance.bootstrap();
    b.instance.bootstrap();
    await drain();
    await a.instance.setTargetApiUrl(HOST_A);
    await b.instance.setTargetApiUrl(HOST_B);
    fetchMock.mockResolvedValue(respond({ token: "mul_abc" }));

    await a.instance.syncToken("jwt-token", "user-1");
    expect(fetchCalls()).toContain("https://a.example.com/api/tokens");
    const aWrite = vi
      .mocked(writeFile)
      .mock.calls.filter(([path]) => String(path).endsWith("config.json"))
      .findLast(([path]) => String(path).includes(PROFILE_A));
    const aCfg = JSON.parse(aWrite?.[1] as string) as Record<string, unknown>;
    expect(aCfg.server_url).toBe(HOST_A);
    expect(aCfg.token).toBe("mul_abc");

    await b.instance.syncToken("jwt-token", "user-1");
    expect(fetchCalls()).toContain("https://b.example.com/api/tokens");
    const bWrite = vi
      .mocked(writeFile)
      .mock.calls.filter(([path]) => String(path).endsWith("config.json"))
      .findLast(([path]) => String(path).includes(PROFILE_B));
    const bCfg = JSON.parse(bWrite?.[1] as string) as Record<string, unknown>;
    expect(bCfg.server_url).toBe(HOST_B);
    expect(bCfg.token).toBe("mul_abc");
  });

  it("probes token validity against its own target after the auth-probe grace", async () => {
    const a = makeInstance("a");
    a.instance.bootstrap();
    await drain();
    state.profileConfigToken = "pat-secret";
    await a.instance.setTargetApiUrl(HOST_A);
    a.instance.start();
    await drain();

    // Health stays down while /api/me rejects the token: two poll ticks past
    // the grace window fire the probe once and the sticky auth_expired
    // verdict reaches this profile's window only.
    fetchMock.mockImplementation(async (input) =>
      String(input).endsWith("/api/me")
        ? respond({}, 401)
        : (undefined as unknown as Response),
    );
    await vi.advanceTimersByTimeAsync(
      AUTH_PROBE_GRACE_MS + POLL_INTERVAL_MS * 2,
    );
    expect(fetchCalls()).toContain("https://a.example.com/api/me");
    const states = statusPayloads(a.sent).map((p) => p.state);
    expect(states).toContain("auth_expired");
  });

  it("drops a daemon reporting another profile's server_url", async () => {
    const a = makeInstance("a");
    a.instance.bootstrap();
    await drain();
    await a.instance.setTargetApiUrl(HOST_A);
    fetchMock.mockResolvedValue(
      respond({ status: "running", server_url: HOST_B, os: HOST_OS }),
    );

    const status = await a.instance.fetchHealth();
    expect(status.state).toBe("stopped");
  });

  it("stops its own daemon with its own profile args on stopForQuit", async () => {
    const a = makeInstance("a");
    const b = makeInstance("b");
    a.instance.bootstrap();
    b.instance.bootstrap();
    await drain();
    await a.instance.setTargetApiUrl(HOST_A);
    await b.instance.setTargetApiUrl(HOST_B);

    const stopA = a.instance.stopForQuit();
    await drain();
    lastExecCallback()(null);
    await stopA;
    const stopB = b.instance.stopForQuit();
    await drain();
    lastExecCallback()(null);
    await stopB;

    const stopArgs = execFileMock.mock.calls.map(
      (call) => (call as unknown as [string, string[]])[1],
    );
    expect(stopArgs).toContainEqual(["daemon", "stop", "--profile", PROFILE_A]);
    expect(stopArgs).toContainEqual(["daemon", "stop", "--profile", PROFILE_B]);
  });
});

