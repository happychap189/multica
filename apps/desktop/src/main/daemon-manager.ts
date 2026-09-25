import { app, ipcMain, BrowserWindow, shell } from "electron";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { hostname } from "os";
import type { DaemonPrefs } from "../shared/daemon-types";
import {
  DaemonManagerInstance,
  loadPrefs,
  savePrefs,
  type SharedCliResolver,
} from "./daemon-manager-instance";
import { ensureManagedCli, managedCliPath } from "./cli-bootstrap";

/**
 * Returns the path to the CLI binary bundled inside the Desktop app.
 *
 * - Dev (`electron-vite dev`): `app.getAppPath()` → `apps/desktop`, resolving
 *   to `apps/desktop/resources/bin/multica`. `bundle-cli.mjs` populates this
 *   before dev starts, so iterating on Go changes is "make build → restart".
 * - Packaged: `app.getAppPath()` → `<Multica.app>/Contents/Resources/app.asar`.
 *   electron-builder's `asarUnpack: resources/**` extracts the binary to
 *   `app.asar.unpacked/`, so we swap the path segment to execute it.
 */
function bundledCliPath(): string {
  const binName = process.platform === "win32" ? "multica.exe" : "multica";
  return join(app.getAppPath(), "resources", "bin", binName).replace(
    "app.asar",
    "app.asar.unpacked",
  );
}

function findCliOnPath(): string | null {
  const candidates = process.platform === "win32" ? ["multica.exe"] : ["multica"];
  const paths = (process.env["PATH"] ?? "").split(
    process.platform === "win32" ? ";" : ":",
  );
  if (process.platform === "darwin") {
    paths.push("/opt/homebrew/bin", "/usr/local/bin");
  }
  for (const name of candidates) {
    for (const dir of paths) {
      const full = join(dir, name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

async function probeCliBinary(
  bin: string,
  source: "bundled" | "managed" | "path",
): Promise<string | null> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        bin,
        ["version", "--output", "json"],
        { timeout: 5_000 },
        (err, out) => {
          if (err) reject(err);
          else resolve(out);
        },
      );
    });
    const parsed = JSON.parse(stdout) as { version?: string };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
    console.warn(
      `[daemon] ignoring ${source} CLI at ${bin}: version output was missing or invalid`,
    );
    return null;
  } catch (err) {
    console.warn(`[daemon] ignoring ${source} CLI at ${bin}:`, err);
    return null;
  }
}

// Returns a usable `multica` binary path (bundled → managed → download →
// PATH). Idempotent and concurrency-safe via `cliResolvePromise`.
let cachedCliBinary: string | null | undefined = undefined;
let cliResolvePromise: Promise<string | null> | null = null;
let cachedCliBinaryVersion: string | null | undefined = undefined;

async function resolveCliBinary(): Promise<string | null> {
  if (cachedCliBinary !== undefined) return cachedCliBinary;
  if (cliResolvePromise) return cliResolvePromise;

  cliResolvePromise = (async () => {
    const bundled = bundledCliPath();
    if (existsSync(bundled)) {
      const version = await probeCliBinary(bundled, "bundled");
      if (version) {
        console.log(`[daemon] using bundled CLI at ${bundled}`);
        cachedCliBinary = bundled;
        cachedCliBinaryVersion = version;
        return bundled;
      }
    }

    const managed = managedCliPath();
    if (existsSync(managed)) {
      const version = await probeCliBinary(managed, "managed");
      if (version) {
        cachedCliBinary = managed;
        cachedCliBinaryVersion = version;
        return managed;
      }
    }

    try {
      const installed = await ensureManagedCli({
        forceInstall: existsSync(managed),
      });
      const version = await probeCliBinary(installed, "managed");
      if (version) {
        cachedCliBinary = installed;
        cachedCliBinaryVersion = version;
        return installed;
      }
      console.warn(
        `[daemon] managed CLI at ${installed} failed validation after install`,
      );
    } catch (err) {
      console.warn("[daemon] CLI auto-install failed, falling back to PATH:", err);
    }

    const onPath = findCliOnPath();
    if (onPath) {
      const version = await probeCliBinary(onPath, "path");
      if (version) {
        cachedCliBinary = onPath;
        cachedCliBinaryVersion = version;
        return onPath;
      }
    }

    cachedCliBinary = null;
    cachedCliBinaryVersion = null;
    return null;
  })();

  try {
    return await cliResolvePromise;
  } finally {
    cliResolvePromise = null;
  }
}

// Reads the version of the currently resolved CLI binary. Cached for the
// process lifetime — the bundled binary doesn't change after bundle time.
// Returns null on any failure so callers can fail open.
async function getCliBinaryVersion(): Promise<string | null> {
  if (cachedCliBinaryVersion !== undefined) return cachedCliBinaryVersion;
  const bin = await resolveCliBinary();
  if (!bin) {
    cachedCliBinaryVersion = null;
    return null;
  }
  cachedCliBinaryVersion = await probeCliBinary(bin, "path");
  return cachedCliBinaryVersion;
}

// Process-level CLI resolution injected into every per-profile manager. The
// CLI binary does not vary by profile (it lives in the app bundle or
// userData/bin), so resolution and its caches are shared.
const sharedCliResolver: SharedCliResolver = {
  resolve: resolveCliBinary,
  getVersion: getCliBinaryVersion,
  resetForRetryInstall(): void {
    cachedCliBinary = undefined;
    cliResolvePromise = null;
    // A retry-install may land a new CLI at a different version; drop the
    // cached version string so the next check re-reads the binary.
    cachedCliBinaryVersion = undefined;
  },
};

export interface SetupDaemonManagerOptions {
  /**
   * The desktop.json profile whose daemon manager bootstraps at app startup.
   * Non-default profiles bootstrap lazily when their first routed daemon IPC
   * arrives (a window's renderer reports its apiUrl at boot, so this is
   * "when that profile's window opens"), keeping the daemon footprint of a
   * single-profile install identical to before.
   */
  defaultProfileId: string;
  /** Resolves a profile's current main window at send-time. */
  windowForProfile: (profileId: string) => BrowserWindow | null;
  /** Maps a renderer's webContents id to its desktop.json profile id. */
  profileIdForSender: (webContentsId: number) => string | undefined;
}

export function setupDaemonManager(options: SetupDaemonManagerOptions): void {
  // One manager per desktop.json profile, created on first contact.
  const managers = new Map<string, DaemonManagerInstance>();

  // Lazily create (and bootstrap) the profile's manager on first contact.
  // bootstrap() is idempotent, so later calls are no-ops.
  function managerFor(profileId: string): DaemonManagerInstance {
    let manager = managers.get(profileId);
    if (!manager) {
      manager = new DaemonManagerInstance({
        windowForProfile: () => options.windowForProfile(profileId),
        cliResolver: sharedCliResolver,
      });
      managers.set(profileId, manager);
    }
    manager.bootstrap();
    return manager;
  }

  // Sender-derived routing (fail-closed): an unregistered sender gets no
  // manager, touches no per-profile state, and creates none. Real renderers
  // register before load (window-profile-registry contract), so this is a
  // defensive path.
  function managerForSender(
    sender: Electron.WebContents,
  ): DaemonManagerInstance | null {
    const profileId = options.profileIdForSender(sender.id);
    if (!profileId) return null;
    return managerFor(profileId);
  }

  // --- sender-derived handlers (14) ---------------------------------------
  // Each of these acts on the per-profile state machine of the profile the
  // requesting renderer belongs to (main and issue windows alike).

  ipcMain.handle("daemon:set-target-api-url", (event, url: string) => {
    managerForSender(event.sender)?.setTargetApiUrl(url);
  });

  ipcMain.handle("daemon:start", (event) => {
    const manager = managerForSender(event.sender);
    if (!manager) return { success: false, error: "unknown window profile" };
    return manager.start();
  });

  ipcMain.handle("daemon:stop", (event) => {
    const manager = managerForSender(event.sender);
    if (!manager) return { success: false, error: "unknown window profile" };
    return manager.stop();
  });

  ipcMain.handle("daemon:restart", (event) => {
    const manager = managerForSender(event.sender);
    if (!manager) return { success: false, error: "unknown window profile" };
    return manager.restart();
  });

  ipcMain.handle("daemon:get-status", async (event) => {
    const manager = managerForSender(event.sender);
    if (!manager) return { state: "stopped" };
    return manager.fetchHealth();
  });

  ipcMain.handle("daemon:probe-runtimes", async (event) => {
    const manager = managerForSender(event.sender);
    if (!manager) return { probeResult: "error" };
    return manager.probeLocalRuntimes();
  });

  // The host's OS name, available regardless of daemon state. The Runtimes
  // page uses it as a fallback identity for "this machine" when no
  // app-managed daemon is reporting a device name (e.g. the daemon runs
  // out-of-band in WSL2). See desktop-runtimes-page.tsx. Process-level, not
  // profile-scoped — shared, not routed.
  ipcMain.handle("daemon:get-host-name", () => hostname());

  ipcMain.handle("daemon:sync-token", (event, token: string, userId: string) => {
    const manager = managerForSender(event.sender);
    if (!manager) return;
    return manager.syncToken(token, userId);
  });

  ipcMain.handle("daemon:clear-token", (event) => {
    const manager = managerForSender(event.sender);
    if (!manager) return;
    return manager.clearToken();
  });

  ipcMain.handle("daemon:reauthenticate", (event, token: string, userId: string) => {
    const manager = managerForSender(event.sender);
    if (!manager) return { ok: false, reason: "transient", message: "unknown window profile" };
    return manager.reauthenticate(token, userId);
  });

  // Process-level: the CLI binary doesn't vary by profile — shared, not routed.
  ipcMain.handle("daemon:is-cli-installed", async () => {
    const bin = await resolveCliBinary();
    return bin !== null;
  });

  ipcMain.handle("daemon:retry-install", async (event) => {
    // Reset the shared resolver before the profile's manager re-runs its
    // bootstrap; a retry may land a new CLI at a different version.
    sharedCliResolver.resetForRetryInstall();
    const manager = managerForSender(event.sender);
    if (!manager) return;
    await manager.retryInstall();
  });

  // desktop_prefs.json is process-global by design (autoStart/autoStop apply
  // to every profile's daemon) — shared, not routed.
  ipcMain.handle("daemon:get-prefs", () => loadPrefs());
  ipcMain.handle(
    "daemon:set-prefs",
    (_event, prefs: Partial<DaemonPrefs>) =>
      loadPrefs().then((cur) => {
        const merged = { ...cur, ...prefs };
        // Changing the preference still affects the next logged-in launch; it
        // does not start/stop the current session. The Settings copy explicitly
        // states that a launched daemon is supervised while Desktop stays open.
        return savePrefs(merged).then(() => merged);
      }),
  );

  ipcMain.handle("daemon:auto-start", (event) => {
    managerForSender(event.sender)?.autoStart();
  });

  // The log stream is bound to the requesting profile: the instance tails its
  // own profile's log file and delivers lines to that profile's current main
  // window, so lines never land in another profile's window.
  ipcMain.on("daemon:start-log-stream", (event) => {
    managerForSender(event.sender)?.startLogStream();
  });

  ipcMain.on("daemon:stop-log-stream", (event) => {
    managerForSender(event.sender)?.stopLogStream();
  });

  // Reveal the daemon's log file in the user's default editor / Console
  // app. Acts as the escape hatch when the in-app log viewer isn't enough
  // (full history, complex search, copy-to-clipboard at scale).
  ipcMain.handle("daemon:open-log-file", async (event) => {
    const manager = managerForSender(event.sender);
    const logPath = manager ? await manager.logFilePath() : null;
    if (!logPath || !existsSync(logPath)) {
      return { success: false, error: "Log file not found yet" };
    }
    // shell.openPath returns "" on success, error string on failure.
    const error = await shell.openPath(logPath);
    return error === "" ? { success: true } : { success: false, error };
  });

  // First-run CLI install kicks off here for the DEFAULT profile at app
  // startup (the historical behavior). Other profiles bootstrap lazily inside
  // managerFor() when their first routed daemon IPC arrives.
  managerFor(options.defaultProfileId);

  // Process-level quit path. Fans out over every live per-profile manager:
  // each drops its recovery intent and stops its own poll timer / log
  // watcher; with autoStop enabled the quit is deferred until every profile's
  // daemon has been stopped.
  let isQuitting = false;
  app.on("before-quit", (event) => {
    if (isQuitting) return;
    for (const manager of managers.values()) {
      manager.prepareForQuit();
    }

    void loadPrefs().then(async (prefs) => {
      if (!prefs.autoStop) return;
      isQuitting = true;
      event.preventDefault();
      try {
        // stopDaemon no-ops for an externally-managed daemon (WSL2 etc.), so
        // this is safe and instant in that case — the guard lives there. #3916
        await Promise.allSettled(
          Array.from(managers.values(), (manager) => manager.stopForQuit()),
        );
      } catch {
        // Best-effort stop on quit
      }
      app.quit();
    });
  });
}


