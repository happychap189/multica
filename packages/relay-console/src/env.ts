// Command-line and environment parsing for the relay console.
//
// Kept pure (no process access) so the whole surface is unit-testable: the
// entrypoint reads `process.argv` / `process.env` once and hands them here.

export interface RelayConsoleArgs {
  /** Issue UUID or human-readable identifier (`MUL-123`). */
  issue: string;
  /** Perform no writes at all; every request must be a GET. */
  readOnly: boolean;
  /** Attach the realtime WebSocket as a refresh accelerator. */
  ws: boolean;
  /** Opt-in path for the local action ledger and operator marks. */
  stateFile: string | null;
  /** Opt-in switch for the §5 recovery actions. Off by default. */
  allowRecoveryActions: boolean;
}

export interface RelayConsoleEnv {
  serverUrl: string;
  token: string;
  /** Workspace UUID or slug; the API client emits it as `X-Workspace-Slug`. */
  workspace: string;
}

export type ParseResult =
  | { ok: true; env: RelayConsoleEnv; args: RelayConsoleArgs }
  | { ok: false; error: string };

export type ArgsResult =
  | { ok: true; args: RelayConsoleArgs }
  | { ok: false; error: string };

export type EnvResult =
  | { ok: true; env: RelayConsoleEnv }
  | { ok: false; error: string };

const FLAGS = new Set(["--read-only", "--ws", "--allow-recovery-actions"]);
const VALUED = new Set(["--issue", "--state-file"]);

function takeValue(
  argv: readonly string[],
  index: number,
  flag: string,
): { ok: true; value: string; next: number } | { ok: false; error: string } {
  const inline = argv[index];
  if (inline === undefined) {
    return { ok: false, error: `internal: missing ${flag}` };
  }
  const eq = inline.indexOf("=");
  if (eq !== -1) {
    const value = inline.slice(eq + 1);
    return value === ""
      ? { ok: false, error: `${flag} requires a value` }
      : { ok: true, value, next: index + 1 };
  }
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    return { ok: false, error: `${flag} requires a value` };
  }
  return { ok: true, value, next: index + 2 };
}

export function parseArgs(argv: readonly string[]): ArgsResult {
  let issue: string | null = null;
  let stateFile: string | null = null;
  let readOnly = false;
  let ws = false;
  let allowRecoveryActions = false;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === undefined) break;

    // A bare `--` is the conventional end-of-options marker, and package
    // managers happily pass it through: `pnpm --filter … dev -- --issue X`
    // reaches this process as `["--", "--issue", "X"]`. This program takes no
    // positional arguments, so skipping the separator is unambiguous and keeps
    // both invocation forms working.
    if (arg === "--") {
      i += 1;
      continue;
    }

    const flag = arg.includes("=") ? arg.slice(0, arg.indexOf("=")) : arg;

    if (FLAGS.has(flag)) {
      if (arg.includes("=")) return { ok: false, error: `${flag} takes no value` };
      if (flag === "--read-only") readOnly = true;
      if (flag === "--ws") ws = true;
      if (flag === "--allow-recovery-actions") allowRecoveryActions = true;
      i += 1;
      continue;
    }

    if (VALUED.has(flag)) {
      const taken = takeValue(argv, i, flag);
      if (!taken.ok) return taken;
      if (flag === "--issue") issue = taken.value;
      if (flag === "--state-file") stateFile = taken.value;
      i = taken.next;
      continue;
    }

    return { ok: false, error: `unknown argument: ${arg}` };
  }

  if (issue === null) {
    return { ok: false, error: "missing required --issue <ref>" };
  }
  if (readOnly && allowRecoveryActions) {
    return {
      ok: false,
      error: "--read-only and --allow-recovery-actions are mutually exclusive",
    };
  }
  return { ok: true, args: { issue, readOnly, ws, stateFile, allowRecoveryActions } };
}

export type Environment = Record<string, string | undefined>;

export function parseEnvironment(env: Environment): EnvResult {
  const serverUrl = env.MULTICA_SERVER_URL?.trim();
  const token = env.MULTICA_API_TOKEN?.trim();
  const workspace = env.MULTICA_WORKSPACE_ID?.trim();

  const missing: string[] = [];
  if (!serverUrl) missing.push("MULTICA_SERVER_URL");
  if (!token) missing.push("MULTICA_API_TOKEN");
  if (!workspace) missing.push("MULTICA_WORKSPACE_ID");
  if (missing.length > 0) {
    return { ok: false, error: `missing required environment: ${missing.join(", ")}` };
  }

  return {
    ok: true,
    env: {
      // Strip trailing slashes: `ApiClient` appends `/api/...` itself.
      serverUrl: (serverUrl ?? "").replace(/\/+$/, ""),
      token: token ?? "",
      workspace: workspace ?? "",
    },
  };
}

export function parseCli(argv: readonly string[], env: Environment): ParseResult {
  const args = parseArgs(argv);
  if (!args.ok) return args;
  const parsedEnv = parseEnvironment(env);
  if (!parsedEnv.ok) return parsedEnv;
  return { ok: true, env: parsedEnv.env, args: args.args };
}

export const USAGE = [
  "usage: relay-console --issue <uuid|MUL-N> [options]",
  "",
  "options:",
  "  --issue <ref>              issue to watch (required)",
  "  --read-only                render only; never writes (GET-only)",
  "  --ws                       attach the realtime socket as a refresh hint",
  "  --state-file <path>        persist the action ledger and operator marks",
  "  --allow-recovery-actions   enable §5 recovery actions (default off)",
  "",
  "environment: MULTICA_SERVER_URL, MULTICA_API_TOKEN, MULTICA_WORKSPACE_ID",
].join("\n");
