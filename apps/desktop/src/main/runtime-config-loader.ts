import { app } from "electron";
import { chmod, readFile, rename, stat, unlink, writeFile } from "fs/promises";
import { basename, dirname, join } from "path";
import {
  DEFAULT_DESKTOP_CONFIG_REGISTRY,
  parseDesktopConfig,
  resolveProfileRuntimeConfig,
  runtimeConfigFromDevEnv,
  singleProfileRegistry,
  type DesktopConfigRegistry,
  type ParsedDesktopConfig,
  type RuntimeConfig,
  type RuntimeConfigEnv,
  type RuntimeConfigError,
  type RuntimeConfigResult,
} from "../shared/runtime-config";

// Registry-level result for the v2 desktop.json registry. `migrated` is true
// when a schema v1 file was upgraded to the registry shape on this load.
export type DesktopConfigResult =
  | { ok: true; registry: DesktopConfigRegistry; migrated: boolean }
  | { ok: false; error: RuntimeConfigError };

export async function loadDesktopConfig(options: {
  isDev: boolean;
  env: RuntimeConfigEnv;
  configPath?: string;
}): Promise<DesktopConfigResult> {
  if (options.isDev) {
    try {
      return {
        ok: true,
        registry: singleProfileRegistry(runtimeConfigFromDevEnv(options.env)),
        migrated: false,
      };
    } catch (err) {
      return { ok: false, error: { message: errorMessage(err) } };
    }
  }

  const configPath = options.configPath ?? desktopConfigPath();
  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    if (isMissingFileError(err)) {
      // First run: no desktop.json yet. Serve the cloud default without
      // writing it back, matching the pre-registry behavior where a missing
      // file silently used the cloud config.
      return { ok: true, registry: DEFAULT_DESKTOP_CONFIG_REGISTRY, migrated: false };
    }
    return {
      ok: false,
      error: { message: `Invalid ${configPath}: ${errorMessage(err)}` },
    };
  }

  let parsed: ParsedDesktopConfig;
  try {
    parsed = parseDesktopConfig(raw);
  } catch (err) {
    return {
      ok: false,
      error: { message: `Invalid ${configPath}: ${errorMessage(err)}` },
    };
  }

  if (parsed.migrated) {
    try {
      await writeConfigAtomically(configPath, parsed.registry);
    } catch (err) {
      // Best-effort persistence: the in-memory registry is already valid for
      // this run, and the next launch retries the write-back. Never block
      // startup because the migration could not be persisted.
      console.warn(
        "[runtime-config] failed to persist migrated desktop config:",
        configPath,
        errorMessage(err),
      );
    }
  }

  return { ok: true, registry: parsed.registry, migrated: parsed.migrated };
}

// Compatibility projection retained for the pre-registry IPC surface
// (`runtime-config:get` still serves a single RuntimeConfig). Phase 2 rewires
// the caller to loadDesktopConfig; remove this wrapper then.
export async function loadRuntimeConfig(options: {
  isDev: boolean;
  env: RuntimeConfigEnv;
  configPath?: string;
}): Promise<RuntimeConfigResult> {
  const result = await loadDesktopConfig(options);
  if (!result.ok) return result;
  return {
    ok: true,
    config: resolveProfileRuntimeConfig(result.registry, result.registry.defaultProfile),
  };
}

export function desktopConfigPath(): string {
  return join(app.getPath("home"), ".multica", "desktop.json");
}

// Atomic write-back for the v1 -> v2 migration: write a sibling temp file in
// the same directory (rename stays atomic within one filesystem), rename over
// the target, then restore the original file mode. writeFile's mode argument
// is umask-masked at creation, so the original mode is captured up front and
// re-applied with chmod after the rename; brand-new files keep the process
// default mode.
async function writeConfigAtomically(
  configPath: string,
  registry: DesktopConfigRegistry,
): Promise<void> {
  const tempPath = join(
    dirname(configPath),
    `.${basename(configPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let mode: number | undefined;
  try {
    mode = (await stat(configPath)).mode & 0o777;
  } catch {
    // New file: keep the process default mode.
  }
  try {
    await writeFile(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf-8");
    await rename(tempPath, configPath);
  } catch (err) {
    // Best-effort temp cleanup so a failed migration leaves no droppings.
    await unlink(tempPath).catch(() => {});
    throw err;
  }
  if (mode !== undefined) {
    await chmod(configPath, mode);
  }
}

function isMissingFileError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT",
  );
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export type { RuntimeConfig, RuntimeConfigResult };
