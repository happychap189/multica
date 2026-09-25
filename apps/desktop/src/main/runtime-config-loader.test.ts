// @vitest-environment node
import { access, chmod, mkdtemp, readdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it } from "vitest";
import { DEFAULT_DESKTOP_CONFIG_REGISTRY } from "../shared/runtime-config";
import { loadDesktopConfig, loadRuntimeConfig } from "./runtime-config-loader";

describe("loadRuntimeConfig", () => {
  it("uses dev env and ignores desktop.json during electron-vite dev", async () => {
    const dir = await mkdtemp(join(tmpdir(), "multica-desktop-config-"));
    const configPath = join(dir, "desktop.json");
    await writeFile(
      configPath,
      JSON.stringify({ schemaVersion: 1, apiUrl: "https://prod.example.com" }),
    );

    await expect(
      loadRuntimeConfig({
        isDev: true,
        configPath,
        env: {
          apiUrl: "http://localhost:8080",
          wsUrl: "ws://localhost:8080/ws",
          appUrl: "http://localhost:3000",
        },
      }),
    ).resolves.toEqual({
      ok: true,
      config: {
        schemaVersion: 1,
        apiUrl: "http://localhost:8080",
        wsUrl: "ws://localhost:8080/ws",
        appUrl: "http://localhost:3000",
      },
    });
  });

  it("uses cloud defaults when packaged config is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "multica-desktop-config-"));
    await expect(
      loadRuntimeConfig({
        isDev: false,
        configPath: join(dir, "missing.json"),
        env: {},
      }),
    ).resolves.toEqual({
      ok: true,
      config: {
        schemaVersion: 1,
        apiUrl: "https://api.multica.ai",
        wsUrl: "wss://api.multica.ai/ws",
        appUrl: "https://multica.ai",
      },
    });
  });

  it("parses a valid packaged desktop.json", async () => {
    const dir = await mkdtemp(join(tmpdir(), "multica-desktop-config-"));
    const configPath = join(dir, "desktop.json");
    await writeFile(
      configPath,
      JSON.stringify({ schemaVersion: 1, apiUrl: "https://api.example.com" }),
    );

    await expect(
      loadRuntimeConfig({ isDev: false, configPath, env: {} }),
    ).resolves.toEqual({
      ok: true,
      config: {
        schemaVersion: 1,
        apiUrl: "https://api.example.com",
        wsUrl: "wss://api.example.com/ws",
        appUrl: "https://example.com",
      },
    });
  });

  it("fails closed when packaged desktop.json is invalid", async () => {
    const dir = await mkdtemp(join(tmpdir(), "multica-desktop-config-"));
    const configPath = join(dir, "desktop.json");
    await writeFile(configPath, "{");

    const result = await loadRuntimeConfig({ isDev: false, configPath, env: {} });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(configPath);
      expect(result.error.message).toContain("Invalid desktop runtime config JSON");
    }
  });
});

describe("loadDesktopConfig", () => {
  it("returns the dev env registry and never touches desktop.json in dev", async () => {
    const { configPath } = await makeConfigDir();
    const original = JSON.stringify({ schemaVersion: 1, apiUrl: "https://prod.example.com" });
    await writeFile(configPath, original);

    const result = await loadDesktopConfig({
      isDev: true,
      configPath,
      env: {
        apiUrl: "http://localhost:8080",
        wsUrl: "ws://localhost:8080/ws",
        appUrl: "http://localhost:3000",
      },
    });

    expect(result).toEqual({
      ok: true,
      registry: {
        schemaVersion: 2,
        defaultProfile: "default",
        profiles: {
          default: {
            apiUrl: "http://localhost:8080",
            wsUrl: "ws://localhost:8080/ws",
            appUrl: "http://localhost:3000",
          },
        },
      },
      migrated: false,
    });
    // Dev mode must not consume or rewrite the packaged config file.
    await expect(readFile(configPath, "utf-8")).resolves.toBe(original);
  });

  it("migrates a v1 file to the default-profile registry and writes it back", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({ schemaVersion: 1, apiUrl: "https://api.example.com" }),
    );

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result).toEqual({
      ok: true,
      migrated: true,
      registry: {
        schemaVersion: 2,
        defaultProfile: "default",
        profiles: {
          default: {
            apiUrl: "https://api.example.com",
            wsUrl: "wss://api.example.com/ws",
            appUrl: "https://example.com",
          },
        },
      },
    });

    // The migration is persisted as schema v2 on disk.
    const persisted = JSON.parse(await readFile(configPath, "utf-8"));
    expect(persisted.schemaVersion).toBe(2);
    expect(persisted.defaultProfile).toBe("default");
    expect(persisted.profiles.default).toEqual({
      apiUrl: "https://api.example.com",
      wsUrl: "wss://api.example.com/ws",
      appUrl: "https://example.com",
    });
  });

  it("migration is idempotent: a second load reports migrated=false and does not rewrite", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({ schemaVersion: 1, apiUrl: "https://api.example.com" }),
    );
    await loadDesktopConfig({ isDev: false, configPath, env: {} });

    // Rewrite the migrated file in a valid but non-canonical byte layout
    // (no trailing newline). If the second load wrote anything back, the
    // canonical writer would restore the trailing newline.
    const nonCanonical = (await readFile(configPath, "utf-8")).trimEnd();
    await writeFile(configPath, nonCanonical);

    const second = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.migrated).toBe(false);
    expect(await readFile(configPath, "utf-8")).toBe(nonCanonical);
  });

  it("parses a v2 registry with explicit and derived URLs", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        defaultProfile: "work",
        profiles: {
          work: {
            apiUrl: "https://api.work.example.com/",
            wsUrl: "wss://ws.work.example.com/live/",
          },
          personal: { apiUrl: "https://api.personal.example.com" },
        },
      }),
    );

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result).toEqual({
      ok: true,
      migrated: false,
      registry: {
        schemaVersion: 2,
        defaultProfile: "work",
        profiles: {
          work: {
            apiUrl: "https://api.work.example.com",
            wsUrl: "wss://ws.work.example.com/live",
          },
          personal: { apiUrl: "https://api.personal.example.com" },
        },
      },
    });
  });

  it("blocks when defaultProfile does not match any profile", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        defaultProfile: "missing",
        profiles: { work: { apiUrl: "https://api.example.com" } },
      }),
    );

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('defaultProfile "missing" does not match any profile');
  });

  it("blocks on profile ids outside the whitelist", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        defaultProfile: "Work",
        profiles: { Work: { apiUrl: "https://api.example.com" } },
      }),
    );

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('profile id "Work" must match /^[a-z0-9-]{1,32}$/');
  });

  it("blocks when a profile is missing apiUrl", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        defaultProfile: "work",
        profiles: { work: {} },
      }),
    );

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('profile "work" apiUrl must be a non-empty string');
  });

  it("blocks on duplicate apiUrls that differ only by canonical form", async () => {
    const { configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({
        schemaVersion: 2,
        defaultProfile: "work",
        profiles: {
          work: { apiUrl: "https://api.example.com" },
          personal: { apiUrl: "https://api.example.com:443/" },
        },
      }),
    );

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(
      'profiles "work" and "personal" have the same apiUrl (https://api.example.com)',
    );
  });

  it("serves cloud defaults for a missing file without writing one", async () => {
    const { configPath } = await makeConfigDir();
    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result).toEqual({
      ok: true,
      registry: DEFAULT_DESKTOP_CONFIG_REGISTRY,
      migrated: false,
    });
    await expect(access(configPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves the file mode and leaves no temp files when persisting the migration", async () => {
    const { dir, configPath } = await makeConfigDir();
    await writeFile(
      configPath,
      JSON.stringify({ schemaVersion: 1, apiUrl: "https://api.example.com" }),
    );
    await chmod(configPath, 0o600);

    const result = await loadDesktopConfig({ isDev: false, configPath, env: {} });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(true);
    }

    // writeFile's mode argument is umask-masked, so a preserved 0o600 proves
    // the post-rename chmod ran.
    expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    expect(await readdir(dir)).toEqual(["desktop.json"]);
  });
});

async function makeConfigDir(): Promise<{ dir: string; configPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "multica-desktop-config-"));
  return { dir, configPath: join(dir, "desktop.json") };
}
