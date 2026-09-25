import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, Notification, screen } from "electron";
import { homedir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import fixPath from "fix-path";
import { setupAutoUpdater } from "./updater";
import { setupDaemonManager } from "./daemon-manager";
import { setupLocalDirectory } from "./local-directory";
import { openExternalSafely, downloadURLSafely } from "./external-url";
import { installContextMenu } from "./context-menu";
import { handleAppShortcut } from "./keyboard-shortcuts";
import { installNavigationGestures } from "./navigation-gestures";
import { installNavigationGuard } from "./navigation-guard";
import { createRendererWebPreferences } from "./renderer-web-preferences";
import { getAppVersion } from "./app-version";
import { installOriginStrip } from "./origin-strip";
import {
  createWindowProfileRegistry,
  resolveRuntimeConfigForProfile,
} from "./window-profile-registry";
import { resolveLastActiveProfileId } from "./last-active-profile";
import { loadDesktopConfig, type DesktopConfigResult } from "./runtime-config-loader";
import {
  DEFAULT_DESKTOP_CONFIG_REGISTRY,
  type DesktopConfigRegistry,
  type RuntimeConfigResult,
} from "../shared/runtime-config";
import {
  RENDERER_ROUTE_CONTEXT_CHANNEL,
  sanitizeRendererRouteContext,
  type RendererRouteContext,
} from "../shared/renderer-route-context";
import {
  createElectronReloadPrompt,
  installRendererRecoveryHandlers,
  type RendererRecoveryWindow,
} from "./renderer-recovery";
import { createBestEffortDevLog } from "./dev-log";
import {
  writeFreezeBreadcrumb,
  readFreezeBreadcrumb,
  ackFreezeBreadcrumb,
  clearFreezeBreadcrumb,
} from "./freeze-breadcrumb";
import {
  loadWindowState,
  resolveWindowOptions,
  saveWindowStateToFile,
  snapshotWindowState,
  windowStateFilePath,
} from "./window-state";
import {
  encodeIssueWindowArgument,
  parseIssueWindowRequest,
  type IssueWindowContext,
} from "../shared/issue-window";
import {
  AUTH_SESSION_STATE_CHANNEL,
  parseAuthSessionUserId,
} from "../shared/auth-session";
import {
  MAIN_RENDERER_CHANNEL_STATE_CHANNEL,
  MainRendererMessageQueue,
  parseMainRendererChannelState,
  TAB_SELECTION_SHORTCUT_CHANNEL,
  type MainRendererMessageChannel,
} from "../shared/main-renderer-messages";
import { AuthSessionCoordinator } from "./auth-session-coordinator";
import {
  NotificationGate,
  parseNativeNotificationPayload,
} from "./notification-gate";

// Guards against registering the will-download handler more than once on the
// same session. window.webContents.session is shared, and createMainWindow() can
// be called again on macOS (app "activate" after all windows are closed).
const downloadDialogSessions = new WeakSet<Electron.Session>();

function installDownloadSaveDialogHandler(window: BrowserWindow): void {
  const { session } = window.webContents;
  if (downloadDialogSessions.has(session)) return;
  downloadDialogSessions.add(session);
  session.on("will-download", (_event, item) => {
    item.setSaveDialogOptions({
      defaultPath: join(app.getPath("downloads"), item.getFilename()),
    });
  });
}

// Bundled icon used for dock/taskbar branding. macOS/Windows production
// builds let the OS pick up the icon from the .app bundle / .exe resources,
// but Linux production needs an explicit BrowserWindow `icon` — AppImage
// direct-launch doesn't register the .desktop entry, so GNOME has no path
// from the running window to the hicolor icon and falls back to the
// theme default. Consumed in createMainWindow() (all platforms in dev, Linux
// in prod) and the macOS dev dock branch.
//
// `asarUnpack: resources/**` in electron-builder.yml extracts the icon to
// `app.asar.unpacked/`, but `__dirname` resolves into `app.asar/`. The
// Linux native window-icon code path expects a real filesystem path
// (unlike Electron's nativeImage loader which transparently reads from
// asar), so swap the segment — same pattern as bundledCliPath() in
// daemon-manager.ts. In dev `__dirname` has no `app.asar`, so the replace
// is a no-op.
const BUNDLED_ICON_PATH = join(__dirname, "../../resources/icon.png").replace(
  "app.asar",
  "app.asar.unpacked",
);

// macOS/Linux GUI launches inherit a minimal PATH from launchd that omits
// the user's shell config (~/.zshrc, Homebrew, nvm, ~/.local/bin, etc.).
// Run the user's login shell once to recover the real PATH so the bundled
// multica CLI can find agent binaries like claude/codex/opencode. Must run
// before any child_process.spawn / execFile call in the main process —
// ES module imports are hoisted, so this block executes before createWindow
// or any daemon-manager spawn.
if (process.platform !== "win32") {
  fixPath();
  // Fallback: prepend common install locations in case fix-path came up
  // short (broken shell rc, non-interactive $SHELL, missing entries). Safe
  // to duplicate — PATH lookups short-circuit on first match.
  const fallbackPaths = [
    "/opt/homebrew/bin",
    "/usr/local/bin",
    join(homedir(), ".local/bin"),
  ];
  process.env.PATH = `${fallbackPaths.join(":")}:${process.env.PATH ?? ""}`;
}

const PROTOCOL = "multica";
const devLog = is.dev ? createBestEffortDevLog() : undefined;

// Where the main process parks a freeze/crash breadcrumb until the next
// renderer boot flushes it to telemetry. Lives in userData so it survives a
// force-quit. Resolved lazily — app.getPath is only valid after `ready`.
function freezeBreadcrumbPath(): string {
  return join(app.getPath("userData"), "last-client-failure.json");
}

// Main windows by desktop.json profile id — the single source of truth for
// which profile has a live main window. The pre-multi-profile single
// `mainWindow` variable became a derived reference
// (`mainWindows.get(configRegistry.defaultProfile)`) so single-profile
// behavior is structurally identical to before.
const mainWindows = new Map<string, BrowserWindow>();
// webContents id → profile id for every Multica renderer (main + issue
// windows). Registered before each window's loadRenderer() call so the
// preload's synchronous `runtime-config:get` resolves on the first IPC.
const windowProfiles = createWindowProfileRegistry();
const issueWindows = new Set<BrowserWindow>();
const notificationGate = new NotificationGate();
let desktopInitialized = false;

// Most recently focused main-window profile; undefined until a main window
// first gains focus. Consumed only through resolveLastActiveProfileId, which
// falls back to the default profile when this is undefined or stale.
let lastFocusedProfileId: string | undefined;

// Per-profile main-process singletons. Every desktop.json profile owns one
// entry, holding:
// - its queued-message pipeline — deep links / chord relays wait for that
//   profile's own main renderer readiness, never another profile's;
// - its auth-session coordinator — issue windows bind to their own profile's
//   account, so profile B's issue windows never close because profile A
//   logged out or switched accounts;
// - its auth-session generation counter — a notification click validates
//   against the generation of the profile that showed it.
// Single-profile installs hold exactly one entry, structurally identical to
// the previous module-level singletons.
interface ProfileRuntime {
  messageQueue: MainRendererMessageQueue;
  authCoordinator: AuthSessionCoordinator<BrowserWindow>;
  authSessionGeneration: number;
}

const profileRuntimes = new Map<string, ProfileRuntime>();

function profileRuntimeFor(profileId: string): ProfileRuntime {
  let runtime = profileRuntimes.get(profileId);
  if (!runtime) {
    runtime = {
      messageQueue: new MainRendererMessageQueue(),
      authCoordinator: new AuthSessionCoordinator<BrowserWindow>((window) => {
        issueWindows.delete(window);
        if (!window.isDestroyed()) window.close();
      }),
      authSessionGeneration: 0,
    };
    profileRuntimes.set(profileId, runtime);
  }
  return runtime;
}

const rendererRouteContexts = new WeakMap<
  Electron.WebContents,
  RendererRouteContext
>();

// Profile registry from desktop.json, loaded during app ready. Held
// separately from the load result so routing (Dock menu, window creation)
// has a registry to read even while the load result is still the "not
// loaded yet" placeholder.
let configRegistry: DesktopConfigRegistry = DEFAULT_DESKTOP_CONFIG_REGISTRY;
let desktopConfigResult: DesktopConfigResult = {
  ok: false,
  error: { message: "Runtime config has not loaded yet" },
};

// Derived reference: the default profile's main window.
function defaultMainWindow(): BrowserWindow | null {
  return mainWindows.get(configRegistry.defaultProfile) ?? null;
}

// Per-sender runtime config for the preload's synchronous boot call. Fail-
// closed for unregistered senders: the renderer's blocking config-error UI,
// never another profile's endpoints.
function runtimeConfigForSender(sender: Electron.WebContents): RuntimeConfigResult {
  const profileId = windowProfiles.lookup(sender.id);
  if (!profileId) {
    return resolveRuntimeConfigForProfile(configRegistry, undefined);
  }
  // A failed desktop.json load overrides everything: every window shows the
  // blocking error, matching the pre-multi-profile behavior.
  if (!desktopConfigResult.ok) return desktopConfigResult;
  return resolveRuntimeConfigForProfile(configRegistry, profileId);
}

// --- Deep link helpers ---------------------------------------------------

// Sender bound to one profile's main window; consumed as the queue's delivery
// function so a profile's queued payloads can only ever land in its own window.
function sendToProfileWindow(profileId: string) {
  return (channel: MainRendererMessageChannel, payload: unknown): void => {
    const window = mainWindows.get(profileId);
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };
}

function focusMainWindow(window: BrowserWindow): void {
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}

// Recreate a profile's main window when it is gone. Lifecycle paths that
// carry no profile context (macOS activate, second-instance focus) target
// the default profile.
function ensureMainWindowFor(profileId: string): BrowserWindow | null {
  if (!desktopInitialized || !app.isReady()) return null;
  const window = mainWindows.get(profileId);
  if (!window || window.isDestroyed()) {
    return createMainWindow(profileId);
  }
  return window;
}

// Deliver to one profile's main window, honoring that profile's own readiness
// queue. An explicit profile (notification click, chord relay) targets its
// owning window; profile-less dispatches (deep links) go to the last focused
// profile's window, falling back to the default profile. Deep links gain
// safer per-profile routing in Phase 4; until then this is the documented
// interim target.
function dispatchToMainRenderer(
  channel: MainRendererMessageChannel,
  payload: unknown,
  profileId?: string,
): void {
  const targetProfile = resolveLastActiveProfileId(
    configRegistry,
    profileId ?? lastFocusedProfileId,
  );
  profileRuntimeFor(targetProfile).messageQueue.enqueue(
    channel,
    payload,
    sendToProfileWindow(targetProfile),
  );
  const window = ensureMainWindowFor(targetProfile);
  if (window) focusMainWindow(window);
}

function handleDeepLink(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== `${PROTOCOL}:`) return;

    // multica://auth/callback?token=<jwt>
    if (parsed.hostname === "auth" && parsed.pathname === "/callback") {
      const token = parsed.searchParams.get("token");
      if (token) dispatchToMainRenderer("auth:token", token);
      return;
    }

    // multica://invite/<invitationId>
    // Dispatched from the web invite page when the user chooses "Open in
    // desktop app". The renderer opens the invite overlay — no tab, no
    // route persistence, so deep-linking the same invite twice stays safe.
    if (parsed.hostname === "invite") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) dispatchToMainRenderer("invite:open", decodeURIComponent(id));
      return;
    }
  } catch {
    // Ignore malformed URLs
  }
}

// --- Window creation -----------------------------------------------------

// Tracks the OS-preferred language as last seen by the running process.
// Updated on each window-focus check so we can emit a `locale:system-changed`
// event to the renderer when the user changes their OS language without
// quitting the app — without restart, app.getPreferredSystemLanguages()
// would still report the boot value forever.
let lastKnownSystemLocale = "en";

function getSystemLocale(): string {
  return app.getPreferredSystemLanguages()[0] ?? "en";
}

function loadRenderer(window: BrowserWindow): void {
  const rendererEntry = join(__dirname, "../renderer/index.html");
  const rendererURL =
    is.dev && process.env["ELECTRON_RENDERER_URL"]
      ? process.env["ELECTRON_RENDERER_URL"]
      : pathToFileURL(rendererEntry).toString();

  // Installed before the load so the very first navigation is already covered.
  // Both the main window and every issue window load through here, so guarding
  // this one site covers both — see navigation-guard.ts for what is and is not
  // in scope (it is origin hardening; in-app routing never reaches it).
  installNavigationGuard(window, rendererURL);

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    void window.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void window.loadFile(rendererEntry);
  }
}

function installLocaleRefresh(window: BrowserWindow): void {
  // Electron has no dedicated OS-language event. Check whenever any Multica
  // window regains focus, then broadcast so all open windows remain aligned.
  window.on("focus", () => {
    const current = getSystemLocale();
    if (current === lastKnownSystemLocale) return;
    lastKnownSystemLocale = current;
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed()) {
        target.webContents.send("locale:system-changed", current);
      }
    }
  });
}

function installWindowShortcutHandler(window: BrowserWindow): void {
  window.webContents.on("before-input-event", (event, input) => {
    const result = handleAppShortcut(input, window.webContents);
    if (result === "close-tab") {
      event.preventDefault();
      window.webContents.send("tab:close-active");
    } else if (result === "open-settings") {
      event.preventDefault();
      // Settings is a tab, so it can only live in the tabbed main window of
      // the chord source window's profile. Routing through that profile's
      // queue means the chord also works from a dedicated issue window — and
      // from one that outlived the main window, which is recreated and only
      // then handed the request.
      dispatchToMainRenderer(
        "settings:open",
        null,
        windowProfiles.lookup(window.webContents.id),
      );
    } else if (typeof result === "object" && result.action === "select-tab") {
      event.preventDefault();
      // Product tabs only exist in the chord source window's profile main
      // window. Route there even when the chord came from a dedicated issue
      // window, matching Settings behavior.
      dispatchToMainRenderer(
        TAB_SELECTION_SHORTCUT_CHANNEL,
        result.key,
        windowProfiles.lookup(window.webContents.id),
      );
    } else if (result) {
      event.preventDefault();
    }
  });
}

function createMainWindow(profileId: string): BrowserWindow {
  // Pass the OS-preferred language to the renderer via additionalArguments
  // instead of a sync IPC call. process.argv is available to the preload
  // script before the first network request, so the renderer's i18next
  // instance can initialize with the right locale on the very first paint.
  const systemLocale = getSystemLocale();
  lastKnownSystemLocale = systemLocale;

  // Reset this profile's queue readiness only: the renderer that announced
  // readiness for it is being replaced, and the renderer announces readiness
  // once per listener install, not again after a reset — so the recreated
  // window re-announces, then drains anything still pending. Other profiles'
  // queues keep their announced readiness.
  profileRuntimeFor(profileId).messageQueue.resetReady();

  // Restore prior size/position/maximized/fullscreen (#5244), constraining
  // bounds to the work area of the display the window will land on.
  const stateFile = windowStateFilePath(
    app.getPath("userData"),
    profileId,
    configRegistry.defaultProfile,
  );
  const savedWindowState = loadWindowState(stateFile);
  const windowOpts = resolveWindowOptions(
    savedWindowState,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  );

  const window = new BrowserWindow({
    width: windowOpts.width,
    height: windowOpts.height,
    ...(windowOpts.x != null && windowOpts.y != null
      ? { x: windowOpts.x, y: windowOpts.y }
      : {}),
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 17 },
    show: false,
    autoHideMenuBar: true,
    // Windows/Linux pick up the window/taskbar icon from this option.
    // On macOS it's ignored (dock comes from app.dock.setIcon below).
    // Linux production needs this explicitly because AppImage direct-launch
    // does not install a .desktop entry, so the WM has no other path to
    // the bundled icon; without it Ubuntu falls back to the theme default.
    ...(is.dev || process.platform === "linux"
      ? { icon: BUNDLED_ICON_PATH }
      : {}),
    webPreferences: createRendererWebPreferences(
      join(__dirname, "../preload/index.js"),
      systemLocale,
      [],
      profileId,
      configRegistry.defaultProfile,
    ),
  });

  // Profile bookkeeping must land before loadRenderer(): the preload fires a
  // synchronous `runtime-config:get` during load, and an unregistered sender
  // is fail-closed (blocking error UI instead of a wrong server's endpoints).
  const webContentsId = window.webContents.id;
  windowProfiles.register(webContentsId, profileId);
  mainWindows.set(profileId, window);

  // Persist bounds on resize/move (debounced) and on close so the next
  // launch restores size/position and max/fullscreen flags. getNormalBounds
  // is used so maximized/fullscreen still saves the restore size.
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  const persistWindowState = () => {
    const snap = snapshotWindowState(window);
    if (snap) saveWindowStateToFile(stateFile, snap);
  };
  const schedulePersistWindowState = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistWindowState, 400);
  };
  window.on("resize", schedulePersistWindowState);
  window.on("move", schedulePersistWindowState);
  window.on("close", () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistWindowState();
  });

  window.on("closed", () => {
    if (mainWindows.get(profileId) === window) {
      mainWindows.delete(profileId);
      // Only this profile's queue loses readiness; its pending payloads
      // survive for the recreated window to drain. Other profiles untouched.
      profileRuntimeFor(profileId).messageQueue.resetReady();
    }
    windowProfiles.unregister(webContentsId);
  });

  // Strip Origin from WebSocket upgrades on this window's session. Windows
  // sharing a partition share one Session object — installOriginStrip is
  // idempotent per session, so the main window and issue windows of one
  // profile end up with exactly one listener.
  installOriginStrip(window.webContents.session);

  window.on("ready-to-show", () => {
    // Restore max/fullscreen after normal bounds are applied.
    if (windowOpts.isFullScreen) {
      window.setFullScreen(true);
    } else if (windowOpts.isMaximized) {
      window.maximize();
    }
    window.show();
  });

  installLocaleRefresh(window);

  // lastActiveProfileId tracking (2B.5): the most recently focused main
  // window's profile steers profile-less dispatches (deep links). Main
  // windows only — issue windows never change the answer.
  window.on("focus", () => {
    lastFocusedProfileId = profileId;
  });

  installDownloadSaveDialogHandler(window);

  window.webContents.setWindowOpenHandler((details) => {
    openExternalSafely(details.url);
    return { action: "deny" };
  });

  // Calling preventDefault in the shared shortcut handler prevents both the
  // renderer keydown and the application-menu accelerator from double-firing.
  installWindowShortcutHandler(window);

  // Dev-mode renderer diagnostics. When the renderer crashes hard enough
  // that DevTools can't be opened (white screen with no clickable surface),
  // the only way to recover the actual JS error is to forward it from the
  // main process to the dev launcher log. Without these, the
  // user sees only the daemon-manager polling noise (`Render frame was
  // disposed before WebFrameMain could be accessed`) which is a downstream
  // symptom, not the cause.
  //
  // Gated by `is.dev` to keep production logs clean — packaged builds ship
  // failures to crash-reporting separately.
  if (devLog) {
    // Forward every renderer-side console.* call. The detail object also
    // carries source URL + line — included so a thrown stack trace from
    // window.onerror is traceable back to a file.
    window.webContents.on("console-message", (details) => {
      const { level, message, sourceId, lineNumber } = details;
      devLog(level, `${message} (${sourceId}:${lineNumber})`);
    });

    // Fires when loadURL / loadFile can't reach its target (dev server
    // not up yet, network blip, file missing). errorCode is a Chromium
    // net error number; -3 = ABORTED is normal during HMR and skipped.
    window.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (errorCode === -3) return;
        devLog(
          "did-fail-load",
          `code=${errorCode} desc=${errorDescription} url=${validatedURL} mainFrame=${isMainFrame}`,
        );
      },
    );
  }

  installRendererRecoveryHandlers(window as unknown as RendererRecoveryWindow, {
    isDev: is.dev,
    showReloadPrompt: createElectronReloadPrompt((options) =>
      dialog.showMessageBox(window, options),
    ),
    getDiagnosticContext: () => {
      // No `windowUrl`: it is an absolute install path (`/Users/<name>/...`
      // when installed per-user) and the bucketed route below already says
      // which page the window was on, which is the part we can act on.
      const routeContext = rendererRouteContexts.get(window.webContents);
      return routeContext ? { desktopRoute: routeContext } : {};
    },
    // Only persist in production: a true hang/crash can't report itself, so we
    // write a breadcrumb and the next renderer boot flushes it to PostHog. Dev
    // is excluded to keep field telemetry clean.
    persistBreadcrumb: is.dev
      ? undefined
      : (payload) =>
          writeFreezeBreadcrumb(freezeBreadcrumbPath(), {
            ownerId: `main:${window.id}`,
            kind: payload.kind,
            context: payload.context,
            ts: Date.now(),
            version: getAppVersion(),
          }),
    clearBreadcrumb: is.dev
      ? undefined
      : () =>
          clearFreezeBreadcrumb(freezeBreadcrumbPath(), `main:${window.id}`),
    log: devLog,
  });

  installContextMenu(window.webContents);
  installNavigationGestures(window);

  loadRenderer(window);
  return window;
}

// macOS Dock menu: a "New Window" submenu enumerating the desktop.json
// profiles. Injected only when a non-default profile exists, so single-profile
// users keep the stock Dock right-click menu. Clicking an entry focuses that
// profile's main window, or creates it. No application menu is installed —
// Electron's default menu keeps providing Copy/Paste/Quit roles.
function installDockMenuIfNeeded(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const profileIds = Object.keys(configRegistry.profiles);
  const hasNonDefault = profileIds.some((id) => id !== configRegistry.defaultProfile);
  if (!hasNonDefault) return;
  app.dock.setMenu(
    Menu.buildFromTemplate([
      {
        label: "New Window",
        submenu: profileIds.map((profileId) => ({
          label: profileId,
          click: () => {
            const existing = mainWindows.get(profileId);
            if (existing && !existing.isDestroyed()) {
              focusMainWindow(existing);
              return;
            }
            createMainWindow(profileId);
          },
        })),
      },
    ]),
  );
}

function createIssueWindow(profileId: string, context: IssueWindowContext): void {
  const systemLocale = getSystemLocale();
  lastKnownSystemLocale = systemLocale;

  const window = new BrowserWindow({
    width: 960,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: context.title,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 17 },
    show: false,
    autoHideMenuBar: true,
    ...(is.dev || process.platform === "linux"
      ? { icon: BUNDLED_ICON_PATH }
      : {}),
    webPreferences: createRendererWebPreferences(
      join(__dirname, "../preload/index.js"),
      systemLocale,
      [encodeIssueWindowArgument(context)],
      profileId,
      configRegistry.defaultProfile,
    ),
  });

  // Profile bookkeeping before loadRenderer(), same contract as the main
  // window: the preload's synchronous `runtime-config:get` needs the
  // registration in place on its first IPC.
  const webContentsId = window.webContents.id;
  windowProfiles.register(webContentsId, profileId);

  issueWindows.add(window);
  // Bind the issue window to its own profile's account: the profile-scoped
  // coordinator closes it only on that profile's logout/account switch.
  const runtime = profileRuntimeFor(profileId);
  runtime.authCoordinator.registerIssueWindow(window);
  window.on("closed", () => {
    issueWindows.delete(window);
    runtime.authCoordinator.unregisterIssueWindow(window);
    windowProfiles.unregister(webContentsId);
  });

  // Same per-session origin strip as the main window — an issue window in a
  // non-default partition is a fresh Session with no strip of its own.
  installOriginStrip(window.webContents.session);

  window.on("ready-to-show", () => window.show());
  installLocaleRefresh(window);
  installDownloadSaveDialogHandler(window);

  window.webContents.setWindowOpenHandler((details) => {
    void openExternalSafely(details.url);
    return { action: "deny" };
  });
  installWindowShortcutHandler(window);

  const initialRouteContext = sanitizeRendererRouteContext({
    surface: "tab",
    path: context.path,
    workspaceSlug: context.workspaceSlug,
  });
  if (initialRouteContext) {
    rendererRouteContexts.set(window.webContents, initialRouteContext);
  }
  installRendererRecoveryHandlers(window as unknown as RendererRecoveryWindow, {
    isDev: is.dev,
    showReloadPrompt: createElectronReloadPrompt((options) =>
      dialog.showMessageBox(window, options),
    ),
    getDiagnosticContext: () => {
      // No `windowUrl`: it is an absolute install path (`/Users/<name>/...`
      // when installed per-user) and the bucketed route below already says
      // which page the window was on, which is the part we can act on.
      const routeContext = rendererRouteContexts.get(window.webContents);
      return routeContext ? { desktopRoute: routeContext } : {};
    },
    persistBreadcrumb: is.dev
      ? undefined
      : (payload) =>
          writeFreezeBreadcrumb(freezeBreadcrumbPath(), {
            ownerId: `issue:${window.id}`,
            kind: payload.kind,
            context: payload.context,
            ts: Date.now(),
            version: getAppVersion(),
          }),
    clearBreadcrumb: is.dev
      ? undefined
      : () =>
          clearFreezeBreadcrumb(freezeBreadcrumbPath(), `issue:${window.id}`),
    log: devLog,
  });

  installContextMenu(window.webContents);
  loadRenderer(window);
}

// --- Dev / production isolation -------------------------------------------
// Give dev mode a separate app name and userData path so it gets its own
// single-instance lock file and doesn't conflict with the packaged production
// app. Must run BEFORE requestSingleInstanceLock() because the lock location
// is derived from the userData path. (Same approach VS Code uses for
// Stable / Insiders coexistence.)

// DESKTOP_APP_SUFFIX lets parallel worktrees run dev Electron side-by-side
// without fighting for the shared single-instance lock. The suffix is
// appended to the app name + userData path, so each worktree gets its own
// lock file. Default (no env var) keeps behavior unchanged — the common
// single-worktree case still lands at "Multica Canary".
const DEV_APP_NAME = process.env.DESKTOP_APP_SUFFIX
  ? `Multica Canary ${process.env.DESKTOP_APP_SUFFIX}`
  : "Multica Canary";

if (is.dev) {
  app.setName(DEV_APP_NAME);
  app.setPath("userData", join(app.getPath("appData"), DEV_APP_NAME));
} else {
  // Pin the production app name in code. Electron's Linux WM_CLASS is set
  // from app.getName() when the first BrowserWindow is realized; the
  // packaged ASAR's package.json `productName` already steers app.getName()
  // to "Multica", but anchoring it here makes WM_CLASS ↔ StartupWMClass
  // (declared in electron-builder.yml) survive a regression in
  // productName / the build pipeline. Must run before requestSingleInstanceLock().
  app.setName("Multica");
}

// --- Protocol registration -----------------------------------------------

if (process.defaultApp) {
  // In dev, register with the path to the electron binary + app path
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
    app.getAppPath(),
  ]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// --- Single instance lock ------------------------------------------------

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Register before `ready`: macOS can deliver a cold-start URL while runtime
  // config is still loading. handleDeepLink queues the payload until both the
  // main window and its matching React listener exist.
  app.on("open-url", (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Windows/Linux: second instance passes deep link via argv
  app.on("second-instance", (_event, argv) => {
    const window = ensureMainWindowFor(configRegistry.defaultProfile);
    if (window) focusMainWindow(window);

    // On Windows the deep link URL is the last argv entry
    const deepLinkUrl = argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
    if (deepLinkUrl) handleDeepLink(deepLinkUrl);
  });

  // Windows/Linux cold-start deep links are safe to parse now. Delivery is
  // queued because desktopInitialized remains false until runtime config and
  // IPC handlers are ready.
  const coldStartDeepLink = process.argv.find((arg) =>
    arg.startsWith(`${PROTOCOL}://`),
  );
  if (coldStartDeepLink) handleDeepLink(coldStartDeepLink);

  app.whenReady().then(async () => {
    const viteEnv = import.meta.env as ImportMetaEnv & {
      readonly VITE_API_URL?: string;
      readonly VITE_WS_URL?: string;
      readonly VITE_APP_URL?: string;
    };

    const loaded = await loadDesktopConfig({
      isDev: is.dev,
      // electron-vite exposes VITE_* on import.meta.env for the main process;
      // keep dev URL overrides on the same source the renderer used before
      // runtime config moved endpoint resolution into main/preload.
      env: {
        apiUrl: viteEnv.VITE_API_URL,
        wsUrl: viteEnv.VITE_WS_URL,
        appUrl: viteEnv.VITE_APP_URL,
      },
    });

    desktopConfigResult = loaded;
    if (loaded.ok) configRegistry = loaded.registry;

    electronApp.setAppUserModelId(
      is.dev ? "ai.multica.desktop.dev" : "ai.multica.desktop",
    );

    // macOS: replace the default Electron dock icon with the bundled logo
    // so the Canary dev build is visually distinct from a stock Electron
    // run. `app.dock` is macOS-only — guard the call.
    if (is.dev && process.platform === "darwin" && app.dock) {
      const icon = nativeImage.createFromPath(BUNDLED_ICON_PATH);
      if (!icon.isEmpty()) app.dock.setIcon(icon);
    }

    installDockMenuIfNeeded();

    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    // IPC: open URL in default browser (used by renderer for Google login).
    // All scheme-allowlist enforcement lives in openExternalSafely — this
    // is the single audit point for renderer-controlled URLs reaching the
    // OS shell under the app's intentional webSecurity: false configuration
    // (the renderer itself runs sandboxed).
    ipcMain.handle("shell:openExternal", (_event, url: string) => {
      return openExternalSafely(url);
    });

    // Renderer requests its own window close (e.g. Cmd+W on the last main
    // tab, or Cmd+W anywhere in a dedicated issue window).
    ipcMain.on("window:close", (event) => {
      BrowserWindow.fromWebContents(event.sender)?.close();
    });

    ipcMain.handle("window:open-issue", (event, request: unknown) => {
      if (!BrowserWindow.fromWebContents(event.sender)) {
        return { ok: false, reason: "invalid_request" } as const;
      }
      // Sender must belong to a registered profile window; an unregistered
      // sender gets no issue window (fail-closed, same contract as the
      // runtime-config:get handler).
      const profileId = windowProfiles.lookup(event.sender.id);
      if (!profileId) {
        return { ok: false, reason: "invalid_request" } as const;
      }
      const context = parseIssueWindowRequest(request);
      if (!context) {
        return { ok: false, reason: "invalid_request" } as const;
      }
      createIssueWindow(profileId, context);
      return { ok: true } as const;
    });

    ipcMain.handle("file:download-url", (event, url: string) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender);
      if (!sourceWindow) {
        console.warn("[download] ignored file:download-url — source window torn down");
        return;
      }
      downloadURLSafely(sourceWindow, url);
    });

    // Sync IPC: app version + normalized OS for preload. Sync (not invoke) so
    // preload can attach the values to `desktopAPI.appInfo` before any renderer
    // code reads them, ensuring the very first HTTP request from the renderer
    // already carries X-Client-Version and X-Client-OS.
    ipcMain.on("app:get-info", (event) => {
      const p = process.platform;
      const os = p === "darwin" ? "macos" : p === "win32" ? "windows" : p === "linux" ? "linux" : "unknown";
      event.returnValue = { version: getAppVersion(), os };
    });

    // Sync IPC: read + clear any freeze/crash breadcrumb left by a previous
    // session. The renderer flushes it to telemetry on boot (it couldn't be
    // reported when it happened — the renderer was hung or gone). Read-and-
    // clear so a failure reports exactly once.
    ipcMain.on("freeze:get-last", (event) => {
      event.returnValue = readFreezeBreadcrumb(freezeBreadcrumbPath());
    });

    // The renderer got its breadcrumb event to posthog — retire that exact
    // payload. A newer failure recorded since the read keeps its own ts and
    // survives to be reported on the next boot.
    ipcMain.on("freeze:ack", (event, ts: unknown) => {
      if (!BrowserWindow.fromWebContents(event.sender)) return;
      if (typeof ts !== "number" || !Number.isFinite(ts)) return;
      ackFreezeBreadcrumb(freezeBreadcrumbPath(), ts);
    });

    // Sync IPC: preload exposes the validated runtime config before renderer
    // boot. If desktop.json exists but is invalid, renderer receives the
    // blocking error and must not silently fall back to the cloud defaults.
    ipcMain.on("runtime-config:get", (event) => {
      event.returnValue = runtimeConfigForSender(event.sender);
    });

    ipcMain.on(RENDERER_ROUTE_CONTEXT_CHANNEL, (event, context: unknown) => {
      if (!BrowserWindow.fromWebContents(event.sender)) return;
      const sanitized = sanitizeRendererRouteContext(context);
      if (!sanitized) return;
      rendererRouteContexts.set(event.sender, sanitized);
    });

    // Preload announces each listener only after it has been installed by the
    // main renderer. Readiness is scoped per profile: any profile's main
    // window may register — into its own profile's queue — while issue
    // windows, which load the same preload and would also announce, can
    // never mark any queue ready.
    ipcMain.on(
      MAIN_RENDERER_CHANNEL_STATE_CHANNEL,
      (event, state: unknown) => {
        const sourceWindow = BrowserWindow.fromWebContents(event.sender);
        const profileId = windowProfiles.lookup(event.sender.id);
        if (!sourceWindow || !profileId) return;
        if (mainWindows.get(profileId) !== sourceWindow) return;
        const parsed = parseMainRendererChannelState(state);
        if (!parsed) return;
        profileRuntimeFor(profileId).messageQueue.setReady(
          parsed.channel,
          parsed.ready,
          sendToProfileWindow(profileId),
        );
      },
    );

    // Account identity is the only cross-renderer auth signal. Each profile's
    // main window remains authoritative for its own issue windows — profile
    // B's issue windows never close because profile A logged out or switched
    // accounts. Tokens never cross renderer boundaries.
    ipcMain.on(AUTH_SESSION_STATE_CHANNEL, (event, value: unknown) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender);
      const userId = parseAuthSessionUserId(value);
      if (!sourceWindow || userId === undefined) return;
      const profileId = windowProfiles.lookup(event.sender.id);
      if (!profileId) return;

      const runtime = profileRuntimeFor(profileId);
      if (sourceWindow === mainWindows.get(profileId)) {
        const accountInvalidated = runtime.authCoordinator.reportMain(userId);
        if (accountInvalidated) {
          runtime.authSessionGeneration += 1;
          runtime.messageQueue.clear("inbox:open");
        }
        return;
      }
      if (issueWindows.has(sourceWindow)) {
        runtime.authCoordinator.reportIssue(sourceWindow, userId);
      }
    });

    // IPC: toggle immersive mode — hides the macOS traffic lights so full-screen
    // modals (e.g. create-workspace) can place UI in the top-left corner
    // without fighting the native window controls' hit-test.
    ipcMain.handle("window:setImmersive", (event, immersive: boolean) => {
      if (process.platform !== "darwin") return;
      BrowserWindow.fromWebContents(event.sender)?.setWindowButtonVisibility(
        !immersive,
      );
    });

    // Main owns foreground detection and item-level dedupe. Every renderer
    // has its own WebSocket and `document.hasFocus()` only describes that one
    // window, so renderer-only gating can emit N duplicate system banners.
    ipcMain.on("notification:show", (event, value: unknown) => {
      const sourceWindow = BrowserWindow.fromWebContents(event.sender);
      if (!sourceWindow) return;
      const profileId = windowProfiles.lookup(event.sender.id);
      if (!profileId) return;
      const runtime = profileRuntimeFor(profileId);
      if (sourceWindow === mainWindows.get(profileId)) {
        if (!runtime.authCoordinator.hasActiveMainSession()) return;
      } else if (
        !issueWindows.has(sourceWindow) ||
        !runtime.authCoordinator.isCurrentIssueSession(sourceWindow)
      ) {
        return;
      }

      const payload = parseNativeNotificationPayload(value);
      if (!payload || !Notification.isSupported()) return;
      // The gate is intentionally process-global: cross-profile focus
      // suppression (a focused window suppresses every profile's banner) and
      // process-wide itemId dedupe read as one coherent notification stream —
      // the user cannot tell profiles apart in Notification Center.
      const anyWindowFocused = BrowserWindow.getAllWindows().some(
        (window) => !window.isDestroyed() && window.isFocused(),
      );
      if (!notificationGate.shouldShow(payload.itemId, anyWindowFocused)) {
        return;
      }

      const notification = new Notification({
        title: payload.title,
        body: payload.body,
      });
      // The click guard compares against the showing profile's own
      // generation: a banner for profile A must not navigate after profile A
      // logs out or switches accounts, regardless of what profile B does.
      const notificationSessionGeneration = runtime.authSessionGeneration;
      notification.on("click", () => {
        if (
          notificationSessionGeneration !==
          profileRuntimeFor(profileId).authSessionGeneration
        ) {
          return;
        }
        // Deliver to the owning profile's window — recreated when an
        // issue-only window outlived it — and wait for that profile's inbox
        // listener before the navigation lands.
        dispatchToMainRenderer(
          "inbox:open",
          {
            slug: payload.slug,
            itemId: payload.itemId,
            issueKey: payload.issueKey,
          },
          profileId,
        );
      });
      notification.show();
    });

    // IPC: update the dock / taskbar unread badge. Values above 99 render as
    // "99+". macOS is the primary target (user-visible dock badge); Linux
    // Unity launchers also respect `setBadgeCount`. Windows' taskbar overlay
    // needs a pre-rendered PNG and is deferred — the OS notification + the
    // in-app inbox sidebar cover the core UX there for now.
    ipcMain.on("badge:set", (_event, rawCount: number) => {
      const count = Math.max(0, Math.floor(rawCount));
      if (process.platform === "darwin") {
        const label = count === 0 ? "" : count > 99 ? "99+" : String(count);
        app.dock?.setBadge(label);
      } else {
        app.setBadgeCount(count);
      }
    });

    desktopInitialized = true;
    createMainWindow(configRegistry.defaultProfile);

    // KNOWN LIMITATION (fork phase): auto-update events — the update banner
    // and quitAndInstall — target the default profile's main window only.
    // The updater is process-level while windows are per-profile; broadcast
    // to every profile window is deferred until upstreaming, so non-default
    // windows learn about updates at the next full app restart.
    setupAutoUpdater(() => defaultMainWindow());
    // Daemon setup stays single-profile in this phase (Phase 3 makes
    // DaemonManager per-profile; this getter is its routing seam).
    setupDaemonManager(() => defaultMainWindow());
    // Sender-first: the handler resolves the dialog's parent from
    // event.sender and only falls back to this getter, so every profile's
    // renderer parents its directory picker to its own window.
    setupLocalDirectory(() => defaultMainWindow());

    app.on("activate", () => {
      const window = ensureMainWindowFor(configRegistry.defaultProfile);
      if (window) focusMainWindow(window);
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
