import { ApiClient } from "@multica/core/api/client";
import type { Logger } from "@multica/core/logger";
import { setCurrentWorkspace } from "@multica/core/platform/workspace-storage";

import type { RelayConsoleEnv } from "../env";

/**
 * The single place this program talks HTTP.
 *
 * Two things are worth knowing before changing anything here.
 *
 * 1. **Workspace identity is a singleton, and it must be a SLUG.** `ApiClient`
 *    reads `getCurrentSlug()` and emits it as the `X-Workspace-Slug` header;
 *    it never sends `X-Workspace-ID`. Measured against the running backend:
 *    `X-Workspace-Slug: <uuid>` → 404 `workspace not found`, while the same
 *    uuid under `X-Workspace-ID` → 200. The relay's env file carries a uuid, so
 *    a uuid is resolved to its slug through `GET /api/workspaces` before
 *    anything else runs.
 *
 * 2. **`ApiClient` logs every request through its `logger`** (`client.ts` emits
 *    `→ ${method} ${path}` and `← ${status} ${path}`). Passing a recording
 *    logger is therefore a genuine method-level audit — the read-only proof
 *    asserts about the methods the HTTP layer actually used, not about what
 *    this program intended.
 */

export interface RequestRecord {
  readonly method: string;
  readonly path: string;
}

/** Every HTTP method the client actually issued, in order. */
export class RequestAudit {
  private readonly records: RequestRecord[] = [];

  record(method: string, path: string): void {
    this.records.push({ method, path });
  }

  entries(): readonly RequestRecord[] {
    return this.records;
  }

  methods(): readonly string[] {
    return this.records.map((record) => record.method);
  }

  /** Non-GET requests. Empty means the run performed no writes. */
  writes(): readonly RequestRecord[] {
    return this.records.filter((record) => record.method !== "GET");
  }

  allReads(): boolean {
    return this.writes().length === 0;
  }
}

/** Matches `→ GET /api/issues/123` in the client's request log. */
const REQUEST_LINE = /^→ (\S+) (\S+)/;

export function createAuditLogger(audit: RequestAudit, sink?: Logger): Logger {
  const forward = (level: "debug" | "info" | "warn" | "error") => {
    if (!sink) return;
    return (msg: string, ...data: unknown[]) => sink[level](msg, ...data);
  };
  return {
    debug: forward("debug") ?? (() => {}),
    info(msg: string, ...data: unknown[]) {
      const match = REQUEST_LINE.exec(msg);
      if (match?.[1] !== undefined && match[2] !== undefined) {
        audit.record(match[1], match[2]);
      }
      forward("info")?.(msg, ...data);
    },
    warn: forward("warn") ?? (() => {}),
    error: forward("error") ?? (() => {}),
  };
}

export interface ResolvedWorkspace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class WorkspaceResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceResolutionError";
  }
}

/**
 * Turn the configured workspace (uuid or slug) into the id/slug pair the client
 * and the UI both need.
 */
export async function resolveWorkspace(
  api: ApiClient,
  configured: string,
): Promise<ResolvedWorkspace> {
  const wantsUuid = UUID_RE.test(configured);
  const workspaces = await api.listWorkspaces();
  const match = workspaces.find((workspace) =>
    wantsUuid ? workspace.id === configured : workspace.slug === configured,
  );

  if (!match) {
    const available = workspaces.map((workspace) => `${workspace.slug} (${workspace.id})`);
    throw new WorkspaceResolutionError(
      `workspace '${configured}' not found; the token can see: ${available.join(", ") || "(none)"}`,
    );
  }
  return { id: match.id, slug: match.slug, name: match.name };
}

export interface ConsoleClient {
  readonly api: ApiClient;
  readonly workspace: ResolvedWorkspace;
  readonly audit: RequestAudit;
}

export interface ConnectOptions {
  /** Forward the client's own request log somewhere (e.g. a debug file). */
  readonly sink?: Logger;
  readonly clientVersion?: string;
}

export async function connect(
  env: RelayConsoleEnv,
  options: ConnectOptions = {},
): Promise<ConsoleClient> {
  const audit = new RequestAudit();
  const api = new ApiClient(env.serverUrl, {
    logger: createAuditLogger(audit, options.sink),
    identity: {
      platform: "cli",
      version: options.clientVersion ?? "relay-console/0.0.0",
      os: process.platform,
    },
    getToken: () => env.token,
  });
  api.setToken(env.token);

  const workspace = await resolveWorkspace(api, env.workspace);
  // Must happen before any workspace-scoped request: the client reads this
  // singleton when it builds headers.
  setCurrentWorkspace(workspace.slug, workspace.id);

  return { api, workspace, audit };
}
