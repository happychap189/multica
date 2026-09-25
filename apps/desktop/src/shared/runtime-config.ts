export interface RuntimeConfig {
  schemaVersion: 1;
  apiUrl: string;
  wsUrl: string;
  appUrl: string;
}

export interface RuntimeConfigError {
  message: string;
}

export type RuntimeConfigResult =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; error: RuntimeConfigError };

// Schema v2 named-server registry for desktop.json. Schema v1 files hold a
// single implicit server; v2 files hold named profiles with a designated
// default. RuntimeConfig stays the resolved single-profile view consumed by
// preload/renderer.
export const DESKTOP_CONFIG_SCHEMA_VERSION = 2 as const;

export interface DesktopServerProfile {
  apiUrl: string;
  wsUrl?: string;
  appUrl?: string;
}

export interface DesktopConfigRegistry {
  schemaVersion: typeof DESKTOP_CONFIG_SCHEMA_VERSION;
  defaultProfile: string;
  profiles: Record<string, DesktopServerProfile>;
}

export interface ParsedDesktopConfig {
  registry: DesktopConfigRegistry;
  // True when a schema v1 file was upgraded to the registry shape. The
  // migrated registry is valid for this run; the loader persists it.
  migrated: boolean;
}

export const DEFAULT_DESKTOP_CONFIG_REGISTRY: DesktopConfigRegistry = Object.freeze({
  schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
  defaultProfile: "default",
  profiles: Object.freeze({
    default: Object.freeze({
      apiUrl: "https://api.multica.ai",
      wsUrl: "wss://api.multica.ai/ws",
      appUrl: "https://multica.ai",
    }),
  }),
});

// Wrap a resolved single-profile config as the sole "default" profile of a
// v2 registry. Used by the v1 migration and the dev-env branch.
export function singleProfileRegistry(config: RuntimeConfig): DesktopConfigRegistry {
  return {
    schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION,
    defaultProfile: "default",
    profiles: {
      default: { apiUrl: config.apiUrl, wsUrl: config.wsUrl, appUrl: config.appUrl },
    },
  };
}

// Project one registry profile to the resolved single-profile view, deriving
// wsUrl/appUrl when the file omits them.
export function resolveProfileRuntimeConfig(
  registry: DesktopConfigRegistry,
  profileId: string,
): RuntimeConfig {
  const profile = registry.profiles[profileId];
  if (!profile) {
    throw new Error(`Unknown desktop config profile: ${profileId}`);
  }
  return {
    schemaVersion: 1,
    apiUrl: profile.apiUrl,
    wsUrl: profile.wsUrl ?? deriveWsUrl(profile.apiUrl),
    appUrl: profile.appUrl ?? deriveAppUrl(profile.apiUrl),
  };
}

export const DEFAULT_RUNTIME_CONFIG: RuntimeConfig = Object.freeze({
  schemaVersion: 1,
  apiUrl: "https://api.multica.ai",
  wsUrl: "wss://api.multica.ai/ws",
  appUrl: "https://multica.ai",
});

const LOCAL_DEV_RUNTIME_CONFIG: RuntimeConfig = Object.freeze({
  schemaVersion: 1,
  apiUrl: "http://localhost:8080",
  wsUrl: "ws://localhost:8080/ws",
  appUrl: "http://localhost:3000",
});

export interface RuntimeConfigEnv {
  apiUrl?: string;
  wsUrl?: string;
  appUrl?: string;
}

export function runtimeConfigFromDevEnv(env: RuntimeConfigEnv): RuntimeConfig {
  const apiUrl = normalizeHttpUrl(
    env.apiUrl || LOCAL_DEV_RUNTIME_CONFIG.apiUrl,
    "VITE_API_URL",
  );
  return {
    schemaVersion: 1,
    apiUrl,
    wsUrl: env.wsUrl
      ? normalizeWsUrl(env.wsUrl, "VITE_WS_URL")
      : deriveWsUrl(apiUrl),
    appUrl: env.appUrl
      ? normalizeHttpUrl(env.appUrl, "VITE_APP_URL")
      : deriveDevAppUrl(apiUrl),
  };
}

function parseConfigObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid desktop runtime config JSON: ${err instanceof Error ? err.message : "parse failed"}`,
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid desktop runtime config: expected a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function parseV1ConfigObject(obj: Record<string, unknown>): RuntimeConfig {
  if (obj.schemaVersion !== 1) {
    throw new Error("Unsupported desktop runtime config schemaVersion: expected 1");
  }

  const apiUrl = requiredString(obj.apiUrl, "apiUrl");
  const appUrl = optionalString(obj.appUrl, "appUrl");
  const wsUrl = optionalString(obj.wsUrl, "wsUrl");

  const normalizedApiUrl = normalizeHttpUrl(apiUrl, "apiUrl");
  return {
    schemaVersion: 1,
    apiUrl: normalizedApiUrl,
    wsUrl: wsUrl ? normalizeWsUrl(wsUrl, "wsUrl") : deriveWsUrl(normalizedApiUrl),
    appUrl: appUrl ? normalizeHttpUrl(appUrl, "appUrl") : deriveAppUrl(normalizedApiUrl),
  };
}

export function parseRuntimeConfig(raw: string): RuntimeConfig {
  return parseV1ConfigObject(parseConfigObject(raw));
}

// Registry parser for desktop.json. Accepts both schema versions:
// - v1 (single implicit server) is migrated to a single "default" profile;
//   `migrated: true` tells the loader to persist the migrated registry.
// - v2 validates the named-profile registry:
//   * profile ids must match /^[a-z0-9-]{1,32}$/ — the single validation
//     point covering partition names, window-state filenames, and Dock menu
//     ids downstream;
//   * apiUrls must be distinct after normalization, so `https://x.com`,
//     `https://x.com:443`, and `https://x.com/` fold to one canonical value
//     and count as the same server. Two profiles pointing at one server
//     would fight over the same derived daemon profile (same host + port),
//     so parse rejects them.
export function parseDesktopConfig(raw: string): ParsedDesktopConfig {
  const obj = parseConfigObject(raw);
  if (obj.schemaVersion === 1) {
    return {
      registry: singleProfileRegistry(parseV1ConfigObject(obj)),
      migrated: true,
    };
  }
  if (obj.schemaVersion === 2) {
    return { registry: parseV2ConfigObject(obj), migrated: false };
  }
  throw new Error("Unsupported desktop runtime config schemaVersion: expected 1 or 2");
}

function parseV2ConfigObject(obj: Record<string, unknown>): DesktopConfigRegistry {
  const profilesRaw = obj.profiles;
  if (!profilesRaw || typeof profilesRaw !== "object" || Array.isArray(profilesRaw)) {
    throw new Error("Invalid desktop runtime config: profiles must be an object");
  }

  const entries = Object.entries(profilesRaw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("Invalid desktop runtime config: profiles must not be empty");
  }

  const profiles: Record<string, DesktopServerProfile> = {};
  // Uniqueness key: normalizeHttpUrl output is already canonical — WHATWG
  // parsing lowercases the host and omits default ports, search/hash are
  // cleared, and trimTrailingSlash removes the trailing slash. `https://x.com`,
  // `https://x.com:443`, and `https://x.com/` therefore collapse to one key.
  const canonicalApiUrls = new Map<string, string>();
  for (const [profileId, value] of entries) {
    if (!/^[a-z0-9-]{1,32}$/.test(profileId)) {
      throw new Error(
        `Invalid desktop runtime config: profile id "${profileId}" must match /^[a-z0-9-]{1,32}$/`,
      );
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid desktop runtime config: profile "${profileId}" must be an object`);
    }
    const fields = value as Record<string, unknown>;
    const apiUrlField = `profile "${profileId}" apiUrl`;
    const apiUrl = normalizeHttpUrl(
      requiredString(fields.apiUrl, apiUrlField),
      apiUrlField,
    );
    const duplicate = canonicalApiUrls.get(apiUrl);
    if (duplicate !== undefined) {
      throw new Error(
        `Invalid desktop runtime config: profiles "${duplicate}" and "${profileId}" have the same apiUrl (${apiUrl}); each profile must point to a distinct server`,
      );
    }
    canonicalApiUrls.set(apiUrl, profileId);

    const profile: DesktopServerProfile = { apiUrl };
    const wsUrl = optionalString(fields.wsUrl, `profile "${profileId}" wsUrl`);
    if (wsUrl !== undefined) {
      profile.wsUrl = normalizeWsUrl(wsUrl, `profile "${profileId}" wsUrl`);
    }
    const appUrl = optionalString(fields.appUrl, `profile "${profileId}" appUrl`);
    if (appUrl !== undefined) {
      profile.appUrl = normalizeHttpUrl(appUrl, `profile "${profileId}" appUrl`);
    }
    profiles[profileId] = profile;
  }

  const defaultProfile = requiredString(obj.defaultProfile, "defaultProfile");
  if (!(defaultProfile in profiles)) {
    throw new Error(
      `Invalid desktop runtime config: defaultProfile "${defaultProfile}" does not match any profile`,
    );
  }
  return { schemaVersion: DESKTOP_CONFIG_SCHEMA_VERSION, defaultProfile, profiles };
}

export function deriveWsUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else throw new Error("apiUrl must use http or https");
  url.pathname = joinPath(url.pathname, "/ws");
  url.search = "";
  url.hash = "";
  return trimTrailingSlash(url.toString());
}

// Convention: api hosts are exposed at `api.<web-host>` (api.multica.ai →
// multica.ai, api.test.multica.ai → test.multica.ai). Strip the leading
// `api.` label so a single `apiUrl` configuration produces the right
// shareable web URL. Hosts that don't match the convention (no leading
// `api.` label, or short two-label hosts like `api.local`) fall through
// untouched — those deployments must set `appUrl` explicitly.
export function deriveAppUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  if (url.hostname.startsWith("api.") && url.hostname.split(".").length >= 3) {
    url.hostname = url.hostname.slice("api.".length);
  }
  return trimTrailingSlash(url.toString());
}

// Dev variant: when the api host is the local backend (`localhost:8080` /
// `127.0.0.1:8080`), the renderer is served from a different port (3000),
// so deriving by host alone is wrong. Fall back to the local dev web URL
// in that case; for any non-local host (e.g. a remote test environment),
// trust the production-style derivation so `apiUrl=https://api.test.x`
// yields `appUrl=https://test.x` without a separate VITE_APP_URL.
export function deriveDevAppUrl(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return LOCAL_DEV_RUNTIME_CONFIG.appUrl;
  }
  return deriveAppUrl(apiUrl);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid desktop runtime config: ${field} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid desktop runtime config: ${field} must be a non-empty string when set`);
  }
  return value;
}

function normalizeHttpUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Invalid desktop runtime config: ${field} must be a valid URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Invalid desktop runtime config: ${field} must use http or https`);
  }
  url.search = "";
  url.hash = "";
  return trimTrailingSlash(url.toString());
}

function normalizeWsUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Invalid desktop runtime config: ${field} must be a valid URL`);
  }
  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error(`Invalid desktop runtime config: ${field} must use ws or wss`);
  }
  url.search = "";
  url.hash = "";
  return trimTrailingSlash(url.toString());
}

function joinPath(base: string, suffix: string): string {
  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalizedBase}${suffix}`;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
