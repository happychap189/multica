import type { AgentTask } from "@multica/core/types/agent";

/**
 * The post-write probe.
 *
 * A mention that the server silently drops is indistinguishable from a
 * successful one at the HTTP layer: both return 201. `trigger_outcomes` closes
 * that gap when the server reports it, but the field is documented as
 * create/edit-only and omitted by older builds — so when it is absent, the only
 * remaining evidence that a wake-up happened is a task row appearing.
 *
 * The probe therefore watches the workspace task snapshot for a row on this
 * issue that was not there before. It never writes, and a miss is reported as an
 * alert rather than retried: re-posting a mention that did land would duplicate
 * the work the protocol spent a whole section learning to avoid.
 */

export interface ProbeSource {
  loadTasks(): Promise<readonly AgentTask[]>;
}

export interface ProbeOptions {
  readonly source: ProbeSource;
  readonly issueId: string;
  /** Restrict to these agents (the squad's members). Empty means any agent. */
  readonly agentIds?: readonly string[];
  /** Task ids already present before the write; only newer rows count. */
  readonly baselineTaskIds?: readonly string[];
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  /** Injected so tests do not wait in real time. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export interface ProbeResult {
  readonly found: boolean;
  readonly task: AgentTask | null;
  readonly waitedMs: number;
  readonly polls: number;
}

export const PROBE_TIMEOUT_MS = 90_000;
export const PROBE_INTERVAL_MS = 5_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function probeForTask(options: ProbeOptions): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? PROBE_INTERVAL_MS;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  const baseline = new Set(options.baselineTaskIds ?? []);
  const startedAt = now();

  let polls = 0;
  for (;;) {
    polls += 1;
    let tasks: readonly AgentTask[] = [];
    try {
      tasks = await options.source.loadTasks();
    } catch {
      // A transient failure just means this poll proves nothing; keep watching.
    }

    const hit = tasks.find((task) => {
      if (task.issue_id !== options.issueId) return false;
      if (baseline.has(task.id)) return false;
      if (options.agentIds && options.agentIds.length > 0) {
        return options.agentIds.includes(task.agent_id);
      }
      return true;
    });
    if (hit) {
      return { found: true, task: hit, waitedMs: now() - startedAt, polls };
    }

    if (now() - startedAt >= timeoutMs) {
      return { found: false, task: null, waitedMs: now() - startedAt, polls };
    }
    await sleep(intervalMs);
  }
}

export function describeProbe(result: ProbeResult, target: string): string {
  if (result.found) {
    return `task ${result.task?.id ?? "?"} appeared for ${target} after ${Math.round(result.waitedMs / 1000)}s`;
  }
  return `NO task appeared for ${target} within ${Math.round(result.waitedMs / 1000)}s — the mention was accepted (201) but nothing was woken`;
}
