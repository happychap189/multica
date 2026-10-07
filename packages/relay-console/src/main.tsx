import { render } from "ink";

import { connect, WorkspaceResolutionError } from "./api/client";
import { loadComments, loadIssue, loadTasks } from "./api/issue-repo";
import { USAGE, parseCli } from "./env";
import type { PollState } from "./state/poller";
import { Console } from "./ui/Console";

/**
 * Entrypoint: parse, connect, read once, then hand off to the live console.
 *
 * The first read happens here (rather than inside `Console`) so a bad issue
 * reference or an unreachable backend fails fast with a message, instead of
 * rendering an empty pane. After that the console owns the refresh loop.
 *
 * `--read-only` is enforced, not merely advertised: every request the HTTP layer
 * issued is recorded, and a single non-GET fails the process with exit code 3.
 */

function fail(message: string, code: number): never {
  process.stderr.write(`relay-console: ${message}\n`);
  process.exit(code);
}

const parsed = parseCli(process.argv.slice(2), process.env);

if (!parsed.ok) {
  process.stderr.write(`relay-console: ${parsed.error}\n\n${USAGE}\n`);
  process.exit(2);
}

const { env, args } = parsed;

try {
  const client = await connect(env);
  const issue = await loadIssue(client.api, args.issue);
  const [comments, tasks] = await Promise.all([
    loadComments(client.api, issue.id),
    loadTasks(client.api),
  ]);

  const at = Date.now();
  const initial: PollState = {
    issue,
    comments,
    tasks,
    updatedAt: at,
    issueLoadedAt: at,
    tasksLoadedAt: at,
  };

  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const app = render(
    <Console
      client={client}
      issueRef={args.issue}
      readOnly={args.readOnly}
      interactive={interactive}
      initial={initial}
    />,
  );

  // Piped stdout (a script, a CI log) gets one frame; a terminal keeps the UI up.
  if (!interactive) setTimeout(() => app.unmount(), 60);
  await app.waitUntilExit();

  const writes = client.audit.writes();
  if (args.readOnly && writes.length > 0) {
    process.stderr.write(
      `relay-console: read-only violation — issued ${writes.length} non-GET request(s): ${writes
        .map((entry) => `${entry.method} ${entry.path}`)
        .join(", ")}\n`,
    );
    process.exit(3);
  }
} catch (error) {
  if (error instanceof WorkspaceResolutionError) fail(error.message, 4);
  fail(error instanceof Error ? error.message : String(error), 1);
}
