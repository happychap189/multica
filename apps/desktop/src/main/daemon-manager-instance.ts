import { execFile } from "child_process";
import {
  readFile,
  writeFile,
  mkdir,
  rm,
  open,
  stat,
} from "fs/promises";
import { existsSync, watchFile, unwatchFile, type StatsListener } from "fs";
import { join } from "path";
import { homedir } from "os";
import type {
  DaemonPrefs,
  DaemonStatus,
  LocalRuntimeProbe,
} from "../shared/daemon-types";
import { daemonStatusAlive } from "../shared/daemon-types";
import { decideVersionAction } from "./version-decision";
import {
  deriveProfileName,
  healthPortForProfile,
  profileArgs,
  profileConfigPath,
  profileDir,
  profileLogPath,
  profilePidPath,
  profileUserIdPath,
} from "./daemon-profile";
import {
  DaemonOperationGate,
  DaemonRecoveryPolicy,
  daemonProcessExists,
  parseDaemonPid,
  recoveryStartAllowed,
  runDaemonRecoveryAttempt,
} from "./daemon-recovery";
import {
  daemonLifecycleUnreachable,
  isDaemonExternallyManaged,
  normalizeHostOS,
} from "./daemon-os";
import {
  classifyAuthProbe,
  isAuthStatusError,
  type AuthProbeResult,
} from "./daemon-auth-probe";
import type { RecoveryDecision } from "./daemon-recovery";

// Status polling cadence. Exported for tests that assert per-profile timer
// isolation with fake timers.
export const POLL_INTERVAL_MS = 5_000;
// desktop_prefs.json is intentionally process-global (a documented fork-phase
// simplification): autoStart/autoStop apply to every profile's daemon.
const PREFS_PATH = join(homedir(), ".multica", "desktop_prefs.json");
const LOG_TAIL_RETRY_MS = 2_000;
const LOG_TAIL_MAX_RETRIES = 5;
// How long a start may sit in "starting" (with no /health) before we probe the
// token to find out whether login expired. The daemon's own startup can legitimately
// take a while (it renews the PAT and lists workspaces before serving /health), so we
// wait past the common case to avoid probing healthy-but-slow starts.
// Exported for tests that drive the auth probe with fake timers.
export const AUTH_PROBE_GRACE_MS = 10_000;
// `multica daemon start` blocks until the daemon reports ready, polling /health
// for up to its own startup timeout (45s in server/cmd/multica/cmd_daemon.go) to
// cover cold-start agent-version detection. This execFile timeout MUST stay
// above that — otherwise Electron kills the CLI supervisor mid-startup and a
// healthy-but-slow start is misreported as a failure (the detached daemon child
// keeps running, so the UI flashes "stopped" then "running").
const DAEMON_START_EXEC_TIMEOUT_MS = 60_000;
const HEALTH_PROBE_TIMEOUT_MS = 2_000;
// Five times the UI probe and equal to the auth-probe grace: a daemon that
// misses this second independent window is no longer treated as merely busy.
const RECOVERY_HEALTH_PROBE_TIMEOUT_MS = 10_000;

const DEFAULT_PREFS: DaemonPrefs = { autoStart: true, autoStop: false };

// Always a resolved Desktop-owned profile. "Not resolved yet" is represented by
// `null` at every call site, never by an empty name — see daemon-profile.ts.
export interface ActiveProfile {
  name: string;
  port: number;
}

/**
 * Minimal window surface consumed for status/log delivery. Structural so the
 * main process can pass real BrowserWindows (which satisfy it structurally)
 * and tests can pass fakes without importing Electron here — this module must
 * remain Electron-free so it can be unit-tested in a plain node environment.
 */
export interface DaemonStatusWindow {
  webContents: {
    send(channel: string, payload?: unknown): void;
  };
}

/**
 * Process-level CLI resolution shared by every per-profile manager. The CLI
 * binary lives in userData/bin (or the app bundle) and does not vary by
 * profile, so resolution and its caches are injected rather than duplicated
 * per profile.
 */
export interface SharedCliResolver {
  resolve(): Promise<string | null>;
  getVersion(): Promise<string | null>;
  /** Drops cached resolution state for `daemon:retry-install`. */
  resetForRetryInstall(): void;
}

export interface DaemonManagerInstanceOptions {
  /** Resolves this profile's current main window at send-time. */
  windowForProfile: () => DaemonStatusWindow | null;
  cliResolver: SharedCliResolver;
}

// Serialize all writes to any profile config file. Multiple paths
// (syncToken, resolveActiveProfile, clearToken) may try to write
// concurrently; chaining them avoids interleaved writes corrupting the JSON.
// Intentionally process-global: it serializes writes across all profiles'
// config files, which need mutual exclusion, not per-profile interleaving.
let configWriteChain: Promise<void> = Promise.resolve();

async function readProfileUserId(profile: string): Promise<string | null> {
  try {
    const raw = await readFile(profileUserIdPath(profile), "utf-8");
    const trimmed = raw.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}

async function writeProfileUserId(
  profile: string,
  userId: string,
): Promise<void> {
  await mkdir(profileDir(profile), { recursive: true });
  await writeFile(profileUserIdPath(profile), userId, "utf-8");
}

async function removeProfileUserId(profile: string): Promise<void> {
  try {
    await rm(profileUserIdPath(profile));
  } catch {
    // Already gone — nothing to do.
  }
}

function normalizeUrl(u: string): string {
  if (!u) return "";
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`.toLowerCase();
  } catch {
    return u.replace(/\/+$/, "").toLowerCase();
  }
}

function urlsMatch(a: string, b: string): boolean {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  return na.length > 0 && na === nb;
}

interface HealthPayload {
  status?: string;
  pid?: number;
  /** Daemon's runtime.GOOS. Absent on daemons older than the #3916 fix. */
  os?: string;
  uptime?: string;
  daemon_id?: string;
  device_name?: string;
  server_url?: string;
  cli_version?: string;
  active_task_count?: number;
  agents?: string[];
  workspaces?: unknown[];
}

async function fetchHealthAtPort(
  port: number,
  timeoutMs = HEALTH_PROBE_TIMEOUT_MS,
): Promise<HealthPayload | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as HealthPayload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads the process-global daemon preferences (autoStart/autoStop). Shared by
 * every profile's manager by design — see the PREFS_PATH note above.
 */
export async function loadPrefs(): Promise<DaemonPrefs> {
  try {
    const raw = await readFile(PREFS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function savePrefs(prefs: DaemonPrefs): Promise<void> {
  const dir = join(homedir(), ".multica");
  await mkdir(dir, { recursive: true });
  await writeFile(PREFS_PATH, JSON.stringify(prefs, null, 2), "utf-8");
}

async function readProfileConfig(
  profile: string,
): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(profileConfigPath(profile), "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeProfileConfig(
  profile: string,
  cfg: Record<string, unknown>,
): Promise<void> {
  const op = async () => {
    await mkdir(profileDir(profile), { recursive: true });
    await writeFile(
      profileConfigPath(profile),
      JSON.stringify(cfg, null, 2),
      "utf-8",
    );
  };
  const next = configWriteChain.catch(() => {}).then(op);
  configWriteChain = next.catch(() => {});
  return next;
}

// Env passed to every CLI child so the daemon process knows it was spawned
// by the Desktop app. The server uses this to mark runtimes as managed and
// hide CLI self-update UI. Computed lazily so it picks up the PATH fix
// applied by fix-path in main/index.ts — as a top-level const it would
// snapshot process.env at import time, before that block runs.
function desktopSpawnEnv(): NodeJS.ProcessEnv {
  return { ...process.env, MULTICA_LAUNCHED_BY: "desktop" };
}

function successfulRuntimeProbe(
  providers: string[],
  daemonRunning: boolean,
): Extract<LocalRuntimeProbe, { probeResult: "success" }> {
  const providerSummary: Record<string, number> = {};
  for (const rawProvider of providers) {
    const provider = rawProvider.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(provider)) continue;
    providerSummary[provider] = (providerSummary[provider] ?? 0) + 1;
  }
  const runtimeCount = Object.values(providerSummary).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    probeResult: "success",
    runtimeCount,
    providerSummary,
    onlineCount: daemonRunning ? runtimeCount : 0,
    offlineCount: daemonRunning ? 0 : runtimeCount,
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Result of a user-initiated daemon re-authentication. The distinction matters:
// only `session_invalid` justifies signing the user out of the whole app; a
// `transient` failure must keep them signed in so they can retry.
export type ReauthResult =
  | { ok: true }
  | { ok: false; reason: "session_invalid" }
  | { ok: false; reason: "transient"; message: string };

const LOG_TAIL_INITIAL_WINDOW_BYTES = 32 * 1024;
const LOG_TAIL_INITIAL_LINES = 200;
const LOG_TAIL_POLL_MS = 500;

async function readLogRange(
  path: string,
  startAt: number,
  length: number,
): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, startAt);
    return buffer.subarray(0, bytesRead).toString("utf-8");
  } finally {
    await handle.close();
  }
}

function sendLines(win: DaemonStatusWindow, text: string): void {
  const lines = text.split("\n").filter((line) => line.length > 0);
  for (const line of lines) {
    win.webContents.send("daemon:log-line", line);
  }
}

/**
 * One manager per desktop.json profile. Owns the full per-profile daemon state
 * machine — polling, lifecycle operations, recovery policy, auth probing, log
 * tail — that used to be module-level singletons in daemon-manager.ts.
 *
 * Electron-free by construction: side effects run directly against node
 * built-ins (fetch/execFile/watchFile) and the window surface is injected
 * structurally, so unit tests can drive the class with fake timers and mocked
 * fetch/execFile without importing Electron. IPC registration, the shared CLI
 * resolver, and the process-level before-quit fan-out stay in
 * daemon-manager.ts — the sole registration point for daemon:* channels.
 */
export class DaemonManagerInstance {
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;
  private logTailWatcher: { path: string; listener: StatsListener } | null = null;
  private currentState: DaemonStatus["state"] = "installing_cli";
  private statusPollInProgress = false;
  // Set when a CLI version mismatch was detected but the running daemon is
  // busy executing tasks. The poll loop retries the check on each tick and
  // fires the restart once active_task_count drops to 0.
  private pendingVersionRestart = false;
  private targetApiBaseUrl: string | null = null;
  private activeProfile: ActiveProfile | null = null;
  // Recovery is intentionally process-local: it keeps a daemon alive while the
  // Desktop main process is running, but is not an OS service/watchdog.
  private desiredDaemonRunning = false;
  // Once a foreign-OS daemon (for example WSL2) is observed on this profile, do
  // not replace it with a native daemon if its forwarded health endpoint drops.
  private externalDaemonObserved = false;
  // Per-profile by design: a shared gate would let profile A's 60s daemon:start
  // mark the gate busy for profile B, and busyness feeds `lifecycleBusy` into
  // B's recovery policy (clearing its consecutiveStopped count and delaying
  // B's crash recovery by the full lifecycle op duration plus poll cycles).
  private readonly lifecycleOperations = new DaemonOperationGate();
  private readonly recoveryPolicy = new DaemonRecoveryPolicy();
  // Auth-probe state for the current start attempt. When a start fails to reach
  // "running", we probe the daemon's token once (after AUTH_PROBE_GRACE_MS) to
  // decide whether the cause is an expired/invalid login. `authExpired` is sticky
  // until the next start attempt or a successful /health, so the UI keeps showing
  // the re-login prompt instead of flapping back to "starting". See #3512.
  private startingSince: number | null = null;
  private authProbeDone = false;
  private authExpired = false;
  // Guards the one-time lazy bootstrap. Every created instance bootstraps
  // exactly once, whether at startup (default profile) or at first routed IPC
  // (any other profile).
  private bootstrapStarted = false;

  constructor(private readonly options: DaemonManagerInstanceOptions) {}

  /**
   * One-time per-profile bootstrap: surface "Setting up…", then move into the
   * normal state machine once the CLI is available. Runs through this
   * instance's OWN gate — it is fresh when the instance is created, so the
   * runBackground busy-drop can never discard it (a shared gate across
   * profiles could: the second profile's bootstrap would be dropped and it
   * would stick in installing_cli forever, because installing_cli
   * short-circuits health polling).
   */
  bootstrap(): void {
    if (this.bootstrapStarted) return;
    this.bootstrapStarted = true;
    this.currentState = "installing_cli";
    this.sendStatus({ state: "installing_cli" });
    void this.lifecycleOperations.runBackground(() => this.bootstrapCli());
  }

  /** `daemon:set-target-api-url`: pin this profile's daemon to its server. */
  async setTargetApiUrl(url: string): Promise<void> {
    const normalized = url || null;
    if (this.targetApiBaseUrl !== normalized) {
      console.log(`[daemon] target API URL set to ${normalized ?? "(none)"}`);
      this.setDesiredDaemonRunning(false);
      this.targetApiBaseUrl = normalized;
      this.invalidateActiveProfile();
      await this.pollOnce();
    }
  }

  /** `daemon:start`: member-initiated daemon start. */
  start(): Promise<{ success: boolean; error?: string }> {
    this.externalDaemonObserved = false;
    this.setDesiredDaemonRunning(true, true);
    return this.lifecycleOperations.runForeground(() => this.startDaemon());
  }

  /** `daemon:stop`: member-initiated daemon stop. */
  stop(): Promise<{ success: boolean; error?: string }> {
    this.setDesiredDaemonRunning(false, true);
    return this.lifecycleOperations.runForeground(() => this.stopDaemon());
  }

  /** `daemon:restart`: member-initiated daemon restart. */
  restart(): Promise<{ success: boolean; error?: string }> {
    this.externalDaemonObserved = false;
    this.setDesiredDaemonRunning(true, true);
    return this.lifecycleOperations.runForeground(() => this.restartDaemon());
  }

  /** `daemon:get-status`. */
  fetchHealth(): Promise<DaemonStatus> {
    return this.fetchHealthInternal();
  }

  /** `daemon:probe-runtimes`. */
  probeLocalRuntimes(): Promise<LocalRuntimeProbe> {
    return this.probeLocalRuntimesInternal();
  }

  /**
   * `daemon:sync-token`: persist the session credential for this profile's
   * daemon, restarting only this profile's daemon when the signed-in user
   * changed (other profiles' running daemons are untouched).
   */
  async syncToken(token: string, userId: string): Promise<void> {
    const result = await this.syncTokenInternal(token, userId);
    if (result.userChanged) {
      await this.restartDaemonAfterUserSwitch(result.active);
    }
  }

  /** `daemon:clear-token`. */
  clearToken(): Promise<void> {
    this.setDesiredDaemonRunning(false, true);
    return this.clearTokenInternal();
  }

  /** `daemon:reauthenticate`. */
  reauthenticate(token: string, userId: string): Promise<ReauthResult> {
    this.setDesiredDaemonRunning(true, true);
    return this.lifecycleOperations.runForeground(() =>
      this.reauthenticateInternal(token, userId),
    );
  }

  /** `daemon:auto-start`: login-driven auto-start (renderer driven). */
  async autoStart(): Promise<void> {
    const prefs = await loadPrefs();
    this.setDesiredDaemonRunning(prefs.autoStart);
    if (!prefs.autoStart) return;
    // Login auto-start is emitted once per session. Queue it behind bootstrap
    // instead of dropping it like a retryable poll operation.
    await this.lifecycleOperations.runForeground(async () => {
      const bin = await this.options.cliResolver.resolve();
      if (!bin) return;
      const health = await this.fetchHealthInternal();
      this.observeDaemonBoundary(health);
      if (health.state === "running") {
        // Daemon is up but may be running an older CLI than the one we just
        // bundled. Restart it so the new binary actually takes effect.
        await this.ensureRunningDaemonVersionMatches();
        return;
      }
      await this.startDaemon();
    });
  }

  /** `daemon:retry-install` (after the shell resets the shared CLI resolver). */
  retryInstall(): Promise<void> {
    // A retry-install may land a new CLI at a different version; the shell
    // drops the cached resolver state, and this re-runs the profile's
    // bootstrap into the normal state machine.
    return this.lifecycleOperations.runForeground(() => this.bootstrapCli());
  }

  /** `daemon:start-log-stream`: tail this profile's daemon log to its window. */
  startLogStream(): void {
    this.startLogTail();
  }

  stopLogStream(): void {
    this.stopLogTail();
  }

  /** `daemon:open-log-file` data half; the shell performs shell.openPath. */
  async logFilePath(): Promise<string | null> {
    const active = await this.ensureActiveProfile();
    return active ? profileLogPath(active.name) : null;
  }

  /**
   * before-quit per-instance pre-work: drop the recovery intent and stop this
   * profile's timers and log watcher. The shell fans this out over every live
   * manager.
   */
  prepareForQuit(): void {
    this.setDesiredDaemonRunning(false);
    this.stopPolling();
    this.stopLogTail();
  }

  /**
   * before-quit autoStop pass. Intentionally not gated: the original
   * before-quit path calls stopDaemon directly, and by the time the app is
   * quitting nothing else should be queued on this instance's gate.
   */
  stopForQuit(): Promise<{ success: boolean; error?: string }> {
    return this.stopDaemon();
  }

  /**
   * Test seam: the recovery-policy observation for one status. Exposes how
   * this instance's own gate busyness feeds `lifecycleBusy` — the per-profile
   * gate keeps one profile's long lifecycle op from suppressing another
   * profile's recovery eligibility.
   */
  recoveryDecision(status: DaemonStatus): RecoveryDecision {
    return this.recoveryPolicy.observe({
      desiredRunning: this.desiredDaemonRunning,
      externalDaemonObserved: this.externalDaemonObserved,
      lifecycleBusy: this.lifecycleOperations.inProgress,
      state: status.state,
      now: Date.now(),
    });
  }

  // --- internal state machine ---------------------------------------------

  private sendStatus(status: DaemonStatus): void {
    const win = this.options.windowForProfile();
    win?.webContents.send("daemon:status", status);
  }

  /**
   * Validates the daemon profile's token against the backend to find out whether
   * a stuck start is an auth problem. Hits the same endpoint `multica auth status`
   * uses (GET /api/me) with the exact token the daemon loads from config.json, so
   * the verdict matches what the daemon itself would get from the server.
   *
   * Only the HTTP status is inspected (never the body) so a future change to the
   * /api/me response shape can't break this — a 401 means the token is rejected,
   * a 2xx means it's fine, and a thrown request means the network is the problem,
   * not auth. See classifyAuthProbe for the full rule set.
   */
  private async probeTokenValidity(
    profile: string,
  ): Promise<AuthProbeResult> {
    if (!this.targetApiBaseUrl) return "unknown";
    const cfg = await readProfileConfig(profile);
    const token = typeof cfg.token === "string" ? cfg.token : "";
    if (!token) return classifyAuthProbe({ noToken: true });
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4_000);
      const res = await fetch(
        `${this.targetApiBaseUrl.replace(/\/+$/, "")}/api/me`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        },
      );
      clearTimeout(timeout);
      return classifyAuthProbe({ status: res.status });
    } catch {
      return classifyAuthProbe({ networkError: true });
    }
  }

  /**
   * Returns the Desktop-owned profile for this instance's target API URL.
   * Creates the profile's config.json on demand with `server_url` pinned to
   * the target.
   *
   * Returns `null` until the renderer reports its `apiUrl`. There is no profile
   * to act on in that window, and callers must do nothing rather than reach for
   * the user's default CLI profile at `~/.multica/` — neither its files nor its
   * health port.
   */
  private async resolveActiveProfile(): Promise<ActiveProfile | null> {
    const target = this.targetApiBaseUrl;
    if (!target) return null;

    const name = deriveProfileName(target);
    const cfg = await readProfileConfig(name);

    if (cfg.server_url !== target) {
      cfg.server_url = target;
      await writeProfileConfig(name, cfg);
      console.log(`[daemon] initialized profile "${name}" → ${target}`);
    }

    return { name, port: healthPortForProfile(name) };
  }

  private async ensureActiveProfile(): Promise<ActiveProfile | null> {
    if (this.activeProfile) return this.activeProfile;
    // Only a resolved profile is cached; the target URL arrives over IPC shortly
    // after startup, and caching "unresolved" would persist until something
    // happened to invalidate it.
    this.activeProfile = await this.resolveActiveProfile();
    return this.activeProfile;
  }

  private invalidateActiveProfile(): void {
    this.activeProfile = null;
    this.externalDaemonObserved = false;
    this.recoveryPolicy.reset();
  }

  private setDesiredDaemonRunning(desired: boolean, explicit = false): void {
    if (this.desiredDaemonRunning === desired && !explicit) return;
    this.desiredDaemonRunning = desired;
    this.recoveryPolicy.reset();
  }

  private observeDaemonBoundary(status: DaemonStatus): void {
    if (status.state !== "running") return;
    this.externalDaemonObserved = status.externallyManaged === true;
    if (this.externalDaemonObserved) {
      this.recoveryPolicy.reset();
    }
  }

  private async fetchHealthInternal(): Promise<DaemonStatus> {
    // While the CLI is being downloaded or has permanently failed, short-circuit
    // polling — there's nothing to probe yet and /health calls would just return
    // "stopped", which would overwrite the correct setup state in the UI.
    if (
      this.currentState === "installing_cli" ||
      this.currentState === "cli_not_found"
    ) {
      return { state: this.currentState };
    }

    const active = await this.ensureActiveProfile();
    // No profile yet means no daemon of ours to probe. Reporting "stopped" is the
    // honest answer; probing the default port would surface the user's own CLI
    // daemon as if it were Desktop's.
    if (!active) return { state: "stopped" };
    const data = await fetchHealthAtPort(active.port);

    if (!data || data.status !== "running") {
      // A start that never reaches "running" is the symptom; an expired/invalid
      // login is the most common cause and the one with no other signal (the
      // daemon exits before it can serve /health, so we can't read the reason
      // from it). Probe the token once per attempt, after a grace period, to
      // surface a re-login prompt instead of spinning on "starting" forever.
      if (
        this.currentState === "starting" &&
        !this.authExpired &&
        !this.authProbeDone &&
        this.startingSince !== null &&
        Date.now() - this.startingSince >= AUTH_PROBE_GRACE_MS
      ) {
        this.authProbeDone = true;
        if ((await this.probeTokenValidity(active.name)) === "auth_expired") {
          this.authExpired = true;
        }
      }
      // Sticky: once login is known-expired, keep reporting it (even after
      // currentState flips away from "starting") until the next start attempt or
      // a successful /health clears the flag.
      if (this.authExpired) {
        return { state: "auth_expired", profile: active.name };
      }
      // The daemon binds /health before preflight finishes and self-reports
      // "starting" until it's ready. Trust that over our own currentState, so a
      // daemon booting on its own — or started via the CLI — surfaces as
      // "starting" instead of "stopped".
      if (data?.status === "starting") {
        return { state: "starting", profile: active.name };
      }
      return {
        state:
          this.currentState === "starting"
            ? "starting"
            : this.recoveryPolicy.isPaused
              ? "recovery_paused"
              : "stopped",
        profile: active.name,
      };
    }

    // A live, authenticated daemon clears any prior auth-failure verdict so the
    // re-login prompt disappears once the user reconnects.
    this.authExpired = false;
    this.startingSince = null;

    // A running daemon whose OS differs from this host's is one we can't drive
    // via the native lifecycle CLI (e.g. Linux-in-WSL2 behind a Windows desktop,
    // reachable only over localhost forwarding). Surface it so the UI disables
    // the auto-start/auto-stop toggles instead of letting them silently no-op,
    // and so before-quit skips a stop that would never land. See #3916.
    const externallyManaged = isDaemonExternallyManaged(
      data.os,
      normalizeHostOS(process.platform),
    );

    // Safety: if we have a target URL and the daemon on our port reports a
    // different server_url, it's not "our" daemon — drop it and re-resolve.
    if (
      this.targetApiBaseUrl &&
      data.server_url &&
      !urlsMatch(data.server_url, this.targetApiBaseUrl)
    ) {
      this.invalidateActiveProfile();
      return { state: "stopped" };
    }

    return {
      state: "running",
      pid: data.pid,
      uptime: data.uptime,
      daemonId: data.daemon_id,
      deviceName: data.device_name,
      agents: data.agents ?? [],
      workspaceCount: Array.isArray(data.workspaces)
        ? data.workspaces.length
        : 0,
      profile: active.name,
      serverUrl: data.server_url,
      externallyManaged,
    };
  }

  /**
   * Compares the running daemon's `cli_version` against the CLI binary we
   * would use to spawn a new one, and restarts only when safe. The decision
   * logic itself is in `version-decision.ts` (pure, unit-tested); this
   * wrapper handles the async plumbing and side effects.
   *
   * Restart is only fired when ALL of:
   *   - a daemon is actually running on the active profile's port
   *   - both sides report a version and the strings differ
   *   - `active_task_count` is 0 (no in-flight agent work would be killed)
   *
   * On a confirmed mismatch while the daemon is busy, `pendingVersionRestart`
   * is set; the poll loop retries this function on each 5s tick and will fire
   * the restart as soon as the daemon drains.
   */
  private async ensureRunningDaemonVersionMatches(): Promise<
    "restarted" | "deferred" | "ok" | "not_running"
  > {
    const active = await this.ensureActiveProfile();
    if (!active) return "not_running";
    const running = await fetchHealthAtPort(active.port);

    // Don't try to version-match a daemon we can't restart (e.g. WSL2). Treat it
    // as up-to-date — restartDaemon would no-op anyway, and skipping here avoids
    // a misleading "restarting daemon" log on every auto-start. #3916.
    if (
      isDaemonExternallyManaged(
        running?.os,
        normalizeHostOS(process.platform),
      )
    ) {
      this.pendingVersionRestart = false;
      return "ok";
    }

    const bundled = await this.options.cliResolver.getVersion();
    const action = decideVersionAction(bundled, running);

    switch (action) {
      case "not_running":
        this.pendingVersionRestart = false;
        return "not_running";
      case "ok":
        this.pendingVersionRestart = false;
        return "ok";
      case "defer": {
        if (!this.pendingVersionRestart) {
          const activeTasks = running?.active_task_count ?? 0;
          console.log(
            `[daemon] CLI version mismatch (bundled=${bundled} running=${running?.cli_version}); deferring restart until ${activeTasks} active task(s) finish`,
          );
        }
        this.pendingVersionRestart = true;
        return "deferred";
      }
      case "restart":
        console.log(
          `[daemon] CLI version mismatch (bundled=${bundled} running=${running?.cli_version}) — restarting daemon`,
        );
        this.pendingVersionRestart = false;
        await this.restartDaemon();
        return "restarted";
    }
  }

  /**
   * Exchange the user's JWT for a long-lived PAT via POST /api/tokens. The
   * daemon needs a PAT (or `mul_` / `mdt_` token) because JWTs expire in 30
   * days and signatures are tied to a specific backend instance.
   */
  private async mintPat(jwt: string): Promise<string> {
    if (!this.targetApiBaseUrl) {
      throw new Error("mint PAT: target API URL not set");
    }
    const url = `${this.targetApiBaseUrl.replace(/\/+$/, "")}/api/tokens`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      // Omit expires_in_days → server treats as null → non-expiring PAT.
      body: JSON.stringify({ name: "Multica Desktop" }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      // Attach the status so callers can tell a genuine auth rejection (401 — the
      // session token is dead) apart from a transient failure (5xx, etc.) without
      // string-matching the message.
      throw Object.assign(
        new Error(`mint PAT failed: ${res.status} ${res.statusText} ${body}`),
        { status: res.status },
      );
    }
    const data = (await res.json()) as { token?: unknown };
    if (typeof data.token !== "string" || !data.token.startsWith("mul_")) {
      throw new Error("mint PAT: response missing token");
    }
    return data.token;
  }

  /**
   * Ensure the active profile's config.json has a usable token for the daemon.
   *
   * - Input from the renderer is the user's JWT (from localStorage) plus the
   *   current user's id, so we can detect session changes.
   * - If the profile already has a cached PAT (`mul_...`) AND the sidecar user
   *   id matches the caller, reuse it — minting fresh on every launch would
   *   accumulate garbage in the user's tokens page.
   * - On user mismatch (or first sync) call POST /api/tokens with the JWT to
   *   mint a fresh PAT, overwriting any stale cached PAT. This is the critical
   *   path: without it, a previous user's PAT would be used by a new session.
   * - If the caller happens to pass a PAT directly, write it through.
   * - Reports a user mismatch to the caller; the IPC boundary owns the gated
   *   restart so internal callers such as reauthenticate never re-enter it.
   */
  private async syncTokenInternal(
    tokenFromRenderer: string,
    userId: string,
  ): Promise<{ active: ActiveProfile; userChanged: boolean }> {
    const active = await this.ensureActiveProfile();
    if (!active) {
      // Writing here would land the token and server_url in the user's default
      // CLI config. The renderer awaits setTargetApiUrl before calling this, so
      // reaching this branch is a real error rather than a normal startup race.
      throw new Error(
        "daemon profile is not resolved yet; token sync skipped",
      );
    }
    const config = await readProfileConfig(active.name);
    const previousUserId = await readProfileUserId(active.name);
    const userChanged = Boolean(previousUserId) && previousUserId !== userId;
    const sameUserWithCachedPat =
      !userChanged &&
      previousUserId === userId &&
      typeof config.token === "string" &&
      config.token.startsWith("mul_");

    let finalToken: string;
    if (tokenFromRenderer.startsWith("mul_")) {
      finalToken = tokenFromRenderer;
    } else if (sameUserWithCachedPat) {
      finalToken = config.token as string;
    } else {
      try {
        finalToken = await this.mintPat(tokenFromRenderer);
        console.log(
          `[daemon] minted PAT for profile "${active.name}" (user_changed=${userChanged})`,
        );
      } catch (err) {
        console.error("[daemon] failed to mint PAT:", err);
        throw err;
      }
    }

    config.token = finalToken;
    if (this.targetApiBaseUrl) config.server_url = this.targetApiBaseUrl;
    await writeProfileConfig(active.name, config);
    await writeProfileUserId(active.name, userId);

    return { active, userChanged };
  }

  private async restartDaemonAfterUserSwitch(
    active: ActiveProfile,
  ): Promise<void> {
    // If we just rotated credentials onto a running daemon, restart it so the
    // in-memory token in the Go process matches the new config. Scoped to this
    // instance's daemon — other profiles' running daemons are untouched.
    const existing = await fetchHealthAtPort(active.port);
    if (daemonStatusAlive(existing?.status)) {
      // Restart whether it's "running" or still "starting" — a booting daemon
      // already loaded the old token at startup, so it must be restarted to
      // pick up the rotated credentials.
      console.log(
        "[daemon] user switched — restarting daemon with new credentials",
      );
      // Credential rotation is a one-shot login intent, not poll-driven
      // maintenance: wait for bootstrap/recovery instead of dropping it.
      const restarted = await this.lifecycleOperations.runForeground(() =>
        this.restartDaemon(),
      );
      if (!restarted.success) {
        console.warn(
          `[daemon] restart-on-user-switch failed: ${restarted.error ?? "unknown error"}`,
        );
      }
    }
  }

  private async clearTokenInternal(): Promise<void> {
    const active = await this.ensureActiveProfile();
    // Nothing of ours to clear yet, and the default CLI profile is not ours to
    // strip a token from.
    if (!active) return;
    const config = await readProfileConfig(active.name);
    if ("token" in config) {
      delete config.token;
      await writeProfileConfig(active.name, config);
    }
    // Always drop the sidecar so a subsequent syncToken from any user is
    // treated as a fresh mint, not a reuse of a stale cached PAT.
    await removeProfileUserId(active.name);
  }

  /**
   * Recover the local daemon from the "auth_expired" state. Drops the stale
   * cached PAT, mints a fresh one from the current session token, and restarts
   * the daemon so it loads the new credential.
   *
   * Failures are classified rather than collapsed: a 401 from the mint means the
   * session token itself is dead (`session_invalid` → the renderer drives a full
   * re-login); anything else — mint 5xx, a network blip, a config write error, a
   * restart hiccup — is `transient`, leaving the user signed in so they can retry.
   * This mirrors the conservative classification the startup probe already uses.
   */
  private async reauthenticateInternal(
    token: string,
    userId: string,
  ): Promise<ReauthResult> {
    try {
      await this.clearTokenInternal();
      // syncToken mints a fresh PAT because clearToken just removed any cache.
      await this.syncTokenInternal(token, userId);
    } catch (err) {
      if (isAuthStatusError(err)) {
        return { ok: false, reason: "session_invalid" };
      }
      return { ok: false, reason: "transient", message: errorMessage(err) };
    }
    const restart = await this.restartDaemon();
    if (!restart.success) {
      return {
        ok: false,
        reason: "transient",
        message: restart.error ?? "failed to restart daemon",
      };
    }
    return { ok: true };
  }

  private async probeLocalRuntimesInternal(): Promise<LocalRuntimeProbe> {
    const health = await this.fetchHealthInternal();
    if (health.state === "running") {
      return successfulRuntimeProbe(health.agents ?? [], true);
    }

    const bin = await this.options.cliResolver.resolve();
    if (!bin) return { probeResult: "error" };
    const active = await this.ensureActiveProfile();
    if (!active) return { probeResult: "error" };
    return new Promise((resolve) => {
      execFile(
        bin,
        ["daemon", "probe-runtimes", ...profileArgs(active.name)],
        { timeout: 15_000, env: desktopSpawnEnv(), maxBuffer: 64 * 1024 },
        (error, stdout) => {
          if (error) {
            resolve({ probeResult: "error" });
            return;
          }
          try {
            const parsed = JSON.parse(stdout) as {
              probe_result?: unknown;
              runtime_count?: unknown;
              provider_summary?: unknown;
            };
            if (
              parsed.probe_result !== "success" ||
              typeof parsed.runtime_count !== "number" ||
              !parsed.provider_summary ||
              typeof parsed.provider_summary !== "object" ||
              Array.isArray(parsed.provider_summary)
            ) {
              resolve({ probeResult: "error" });
              return;
            }
            const providers: string[] = [];
            for (const [provider, count] of Object.entries(
              parsed.provider_summary as Record<string, unknown>,
            )) {
              if (
                !Number.isInteger(count) ||
                (count as number) < 0 ||
                (count as number) > 1000
              ) {
                resolve({ probeResult: "error" });
                return;
              }
              providers.push(...Array<string>(count as number).fill(provider));
            }
            const probe = successfulRuntimeProbe(providers, false);
            resolve(
              probe.runtimeCount === parsed.runtime_count
                ? probe
                : { probeResult: "error" },
            );
          } catch {
            resolve({ probeResult: "error" });
          }
        },
      );
    });
  }

  private scheduleStatusRefresh(): void {
    setTimeout(() => void this.pollOnce(), 0);
  }

  private async startDaemon(
    recoveryProfile?: ActiveProfile,
  ): Promise<{ success: boolean; error?: string }> {
    const bin = await this.options.cliResolver.resolve();
    if (!bin) return { success: false, error: "multica CLI is not installed" };

    const active = await this.ensureActiveProfile();
    if (!active) {
      return { success: false, error: "Waiting for the service address" };
    }
    if (
      recoveryProfile &&
      !recoveryStartAllowed({
        desiredRunning: this.desiredDaemonRunning,
        externalDaemonObserved: this.externalDaemonObserved,
        expected: recoveryProfile,
        current: this.activeProfile,
      })
    ) {
      return { success: false, error: "Daemon recovery was superseded" };
    }
    const existing = await fetchHealthAtPort(active.port);
    if (daemonStatusAlive(existing?.status)) {
      // A daemon is already up ("running") or booting ("starting") on this port —
      // don't spawn a second one (the CLI rejects that as "already running").
      // Let polling track it through to "running".
      this.externalDaemonObserved = isDaemonExternallyManaged(
        existing?.os,
        normalizeHostOS(process.platform),
      );
      this.scheduleStatusRefresh();
      return { success: true };
    }
    if (
      recoveryProfile &&
      !recoveryStartAllowed({
        desiredRunning: this.desiredDaemonRunning,
        externalDaemonObserved: this.externalDaemonObserved,
        expected: recoveryProfile,
        current: this.activeProfile,
      })
    ) {
      return { success: false, error: "Daemon recovery was superseded" };
    }

    if (recoveryProfile) {
      this.recoveryPolicy.recordRecoveryAttempt(Date.now());
    }
    this.currentState = "starting";
    // Begin a fresh auth-probe window for this attempt.
    this.startingSince = Date.now();
    this.authProbeDone = false;
    this.authExpired = false;
    this.sendStatus({ state: "starting" });

    const args = ["daemon", "start", ...profileArgs(active.name)];

    return new Promise((resolve) =>
      execFile(
        bin,
        args,
        { timeout: DAEMON_START_EXEC_TIMEOUT_MS, env: desktopSpawnEnv() },
        (err) => {
          if (err) {
            this.currentState = "stopped";
            this.sendStatus({ state: "stopped" });
            resolve({ success: false, error: err.message });
            return;
          }
          // Stay in "starting" until pollOnce confirms /health — the CLI
          // returning 0 only means the supervisor was spawned, not that the
          // daemon process is already listening.
          this.scheduleStatusRefresh();
          resolve({ success: true });
        },
      ),
    );
  }

  /**
   * Fresh boundary preflight for stop/restart: read the active profile's CURRENT
   * /health and decide whether the daemon runs somewhere the app can't drive
   * (WSL2 etc.). Done per call rather than off the poll cache, so a lifecycle op
   * never shells out to a CLI that can't reach the daemon's process — even on
   * paths that didn't just poll (e.g. restart-on-user-switch in syncToken, which
   * calls restartDaemon directly). See #3916.
   */
  private async lifecycleBlockedByForeignDaemon(): Promise<boolean> {
    const active = await this.ensureActiveProfile();
    if (!active) return false;
    return daemonLifecycleUnreachable(
      async () => (await fetchHealthAtPort(active.port))?.os,
      normalizeHostOS(process.platform),
    );
  }

  private async stopDaemon(): Promise<{ success: boolean; error?: string }> {
    // Central lifecycle guard: a daemon running in an environment we can't drive
    // (e.g. Linux in WSL2 behind a Windows desktop) can't be stopped by the
    // native CLI — it would act on the host process namespace and no-op, while
    // still flipping our state to "stopped". Bail as a successful no-op so every
    // caller (logout, quit, restart, the Runtime card) is covered in one place
    // rather than each remembering to check. Preflighted against live /health so
    // it holds even when no poll ran first. #3916.
    if (await this.lifecycleBlockedByForeignDaemon()) return { success: true };

    const bin = await this.options.cliResolver.resolve();
    if (!bin) return { success: false, error: "multica CLI is not installed" };

    const active = await this.ensureActiveProfile();
    if (!active) return { success: true };
    this.currentState = "stopping";
    // An explicit stop is a clean reset — drop any pending auth-failure verdict.
    this.authExpired = false;
    this.startingSince = null;
    this.sendStatus({ state: "stopping" });

    const args = ["daemon", "stop", ...profileArgs(active.name)];

    return new Promise((resolve) => {
      // MULTICA_LAUNCHED_BY=desktop exempts the desktop app's own profile
      // from the CLI's desktop- guard on daemon lifecycle commands.
      execFile(bin, args, { timeout: 15_000, env: desktopSpawnEnv() }, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
        this.currentState = "stopped";
        this.sendStatus({ state: "stopped" });
      });
    });
  }

  private async restartDaemon(): Promise<{ success: boolean; error?: string }> {
    // Same central, live-preflighted guard as stopDaemon: we can neither stop nor
    // start a daemon we don't manage, foreign or otherwise, so don't try
    // (user-switch, reauth, first-workspace, and any future restart caller all
    // route through here). #3916.
    if (await this.lifecycleBlockedByForeignDaemon()) return { success: true };
    const stopResult = await this.stopDaemon();
    if (!stopResult.success) return stopResult;
    return this.startDaemon();
  }

  private async daemonPidIsConfirmedAbsent(profile: string): Promise<boolean> {
    try {
      const raw = await readFile(profilePidPath(profile), "utf-8");
      const pid = parseDaemonPid(raw);
      if (pid === null) {
        console.warn(
          `[daemon] recovery deferred: ${profilePidPath(profile)} is invalid`,
        );
        return false;
      }
      return !daemonProcessExists(pid);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "ENOENT"
      ) {
        return true;
      }
      console.warn("[daemon] recovery deferred: unable to read daemon PID:", err);
      return false;
    }
  }

  private async attemptDaemonRecovery(active: ActiveProfile): Promise<void> {
    const startAllowed = () =>
      recoveryStartAllowed({
        desiredRunning: this.desiredDaemonRunning,
        externalDaemonObserved: this.externalDaemonObserved,
        expected: active,
        current: this.activeProfile,
      });
    const outcome = await runDaemonRecoveryAttempt({
      startAllowed,
      // A normal UI poll intentionally gives up after 2s. Before treating that
      // as process death, use an independent longer probe so a busy daemon is
      // not restarted merely because one health request was slow.
      confirmAlive: async () => {
        const health = await fetchHealthAtPort(
          active.port,
          RECOVERY_HEALTH_PROBE_TIMEOUT_MS,
        );
        if (!daemonStatusAlive(health?.status)) return false;
        this.externalDaemonObserved = isDaemonExternallyManaged(
          health?.os,
          normalizeHostOS(process.platform),
        );
        this.recoveryPolicy.observe({
          desiredRunning: this.desiredDaemonRunning,
          externalDaemonObserved: this.externalDaemonObserved,
          lifecycleBusy: this.lifecycleOperations.inProgress,
          state: health?.status === "running" ? "running" : "starting",
          now: Date.now(),
        });
        this.scheduleStatusRefresh();
        return true;
      },
      pidConfirmedAbsent: () => this.daemonPidIsConfirmedAbsent(active.name),
      recordPidDeferral: () => this.recoveryPolicy.recordPidDeferral(Date.now()),
      recordPidAbsent: () => this.recoveryPolicy.recordPidAbsent(),
      // Force-kill leaves daemon.pid behind, and Windows can reuse the number
      // for another process. After three spaced deferrals, let the CLI recheck
      // health and attempt the start; an occupied port then fails safely into
      // the normal retry backoff and absolute budget.
      onPidFallback: () =>
        console.warn(
          "[daemon] daemon PID stayed unverifiable; proceeding through CLI safety checks",
        ),
      start: () => {
        console.warn("[daemon] managed daemon disappeared; attempting recovery");
        return this.startDaemon(active);
      },
      desiredRunning: () => this.desiredDaemonRunning,
      stop: () => this.stopDaemon(),
    });

    if (outcome.kind === "alive") {
      console.log("[daemon] recovery cancelled: longer health probe succeeded");
    } else if (outcome.kind === "pid_deferred") {
      console.warn(
        "[daemon] recovery deferred: daemon PID is still alive or could not be verified",
      );
    } else if (outcome.kind === "start_failed") {
      console.warn(
        `[daemon] recovery failed: ${outcome.error ?? "unknown error"}`,
      );
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.statusPollInProgress) return;
    this.statusPollInProgress = true;
    try {
      const status = await this.fetchHealthInternal();
      this.currentState = status.state;
      this.observeDaemonBoundary(status);
      const decision = this.recoveryDecision(status);
      this.sendStatus(
        decision === "pause" ? { ...status, state: "recovery_paused" } : status,
      );
      if (decision === "confirm") {
        const active = await this.ensureActiveProfile();
        if (active) {
          // Recovery can spend 10s confirming health plus 60s in the CLI start.
          // Do not hold the poll lock across it: startDaemon publishes
          // "starting" immediately, and subsequent polls keep that visible.
          void this.lifecycleOperations
            .runBackground(() => this.attemptDaemonRecovery(active))
            .catch((err) => {
              console.warn("[daemon] background recovery failed:", err);
            });
        }
      }
      // Retry a deferred version-mismatch restart once the daemon drains. Route
      // it through the same singleflight guard as user and recovery operations.
      if (this.pendingVersionRestart && status.state === "running") {
        void this.lifecycleOperations
          .runBackground(() => this.ensureRunningDaemonVersionMatches())
          .catch((err) => {
            console.warn("[daemon] deferred version restart failed:", err);
          });
      }
    } finally {
      this.statusPollInProgress = false;
    }
  }

  private startPolling(): void {
    if (this.statusPollTimer) return;
    void this.pollOnce();
    this.statusPollTimer = setInterval(
      () => void this.pollOnce(),
      POLL_INTERVAL_MS,
    );
  }

  private stopPolling(): void {
    if (this.statusPollTimer) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }
  }

  /**
   * Ensures the CLI binary is available, then transitions into the normal
   * stopped/running state machine. Called once at profile bootstrap and again
   * on user-triggered `daemon:retry-install`.
   */
  private async bootstrapCli(): Promise<void> {
    const bin = await this.options.cliResolver.resolve();
    if (!bin) {
      this.currentState = "cli_not_found";
      this.sendStatus({ state: "cli_not_found" });
      return;
    }
    this.currentState = "stopped";
    this.sendStatus({ state: "stopped" });
    this.startPolling();
  }

  // --- log tail -------------------------------------------------------------

  // Cross-platform tail -f replacement: read the tail of the file once, then
  // poll its stat with fs.watchFile and forward any new bytes since the last
  // known offset. watchFile works on macOS, Linux, and Windows; spawn("tail")
  // would silently fail on Windows.
  private startLogTail(retryCount = 0): void {
    this.stopLogTail();

    void this.ensureActiveProfile().then(async (active) => {
      // Before the renderer reports its apiUrl there is no Desktop-owned profile
      // yet, and therefore no log file of ours to tail. Retry rather than reach
      // for the default profile's log.
      const logPath = active ? profileLogPath(active.name) : null;
      if (!logPath || !existsSync(logPath)) {
        if (retryCount < LOG_TAIL_MAX_RETRIES) {
          setTimeout(() => this.startLogTail(retryCount + 1), LOG_TAIL_RETRY_MS);
        }
        return;
      }

      // The stream is bound to this profile: both the initial read and the
      // watchFile listener resolve the target window through this instance's
      // own resolver at send-time, so lines follow this profile's current main
      // window even across recreation, and never another profile's.
      const win = this.options.windowForProfile();
      if (!win) return;

      let position = 0;
      try {
        const initialStats = await stat(logPath);
        const windowBytes = Math.min(
          initialStats.size,
          LOG_TAIL_INITIAL_WINDOW_BYTES,
        );
        const startAt = initialStats.size - windowBytes;
        if (windowBytes > 0) {
          const text = await readLogRange(logPath, startAt, windowBytes);
          const lines = text
            .split("\n")
            .filter((line) => line.length > 0)
            .slice(-LOG_TAIL_INITIAL_LINES);
          for (const line of lines) {
            win.webContents.send("daemon:log-line", line);
          }
        }
        position = initialStats.size;
      } catch (err) {
        console.warn("[daemon] log tail initial read failed:", err);
        return;
      }

      const listener: StatsListener = (curr) => {
        const target = this.options.windowForProfile();
        if (!target) return;
        // File rotated/truncated — restart from the new beginning.
        if (curr.size < position) position = 0;
        if (curr.size === position) return;
        const from = position;
        const length = curr.size - from;
        position = curr.size;
        readLogRange(logPath, from, length)
          .then((text) => sendLines(target, text))
          .catch((err) => {
            console.warn("[daemon] log tail read failed:", err);
          });
      };

      watchFile(logPath, { interval: LOG_TAIL_POLL_MS }, listener);
      this.logTailWatcher = { path: logPath, listener };
    });
  }

  private stopLogTail(): void {
    if (this.logTailWatcher) {
      unwatchFile(this.logTailWatcher.path, this.logTailWatcher.listener);
      this.logTailWatcher = null;
    }
  }
}

