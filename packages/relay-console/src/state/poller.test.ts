// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { makeComment, makeIssue, makeTask, TEST_ISSUE_ID } from "../testing/fixtures";

import {
  DEFAULT_INTERVALS,
  Poller,
  type PollDataSource,
  type PollState,
  type Scheduler,
} from "./poller";

/** Drives the loop deterministically instead of waiting on real timers. */
class FakeScheduler implements Scheduler {
  private readonly handles = new Map<number, () => void>();
  private next = 1;
  private clock = 1_000;

  setInterval(callback: () => void, _ms: number): number {
    const handle = this.next++;
    this.handles.set(handle, callback);
    return handle;
  }

  clearInterval(handle: number): void {
    this.handles.delete(handle);
  }

  now(): number {
    return this.clock;
  }

  advance(ms: number): void {
    this.clock += ms;
  }

  /** Fire every registered interval once. */
  fire(): void {
    for (const callback of [...this.handles.values()]) callback();
  }

  get size(): number {
    return this.handles.size;
  }
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

/**
 * A promise whose resolution is triggered from the test.
 *
 * A bare `let resolve: (() => void) | null` is narrowed to `never` at the call
 * site, because the only assignment happens inside the executor callback.
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function dataSource(overrides: Partial<PollDataSource> = {}): PollDataSource {
  let commentsRevision = 0;
  return {
    loadIssueAndComments: vi.fn(async () => {
      commentsRevision += 1;
      return {
        issue: makeIssue({ revision: commentsRevision }),
        comments: [makeComment(`[P1 1/3] state-init done → next workspace-detection`)],
      };
    }),
    loadTasks: vi.fn(async () => [makeTask({ issue_id: TEST_ISSUE_ID })]),
    ...overrides,
  };
}

function setup(options: { source?: PollDataSource } = {}) {
  const scheduler = new FakeScheduler();
  const states: PollState[] = [];
  const errors: unknown[] = [];
  const source = options.source ?? dataSource();
  const poller = new Poller({
    source,
    scheduler,
    onState: (state) => states.push(state),
    onError: (error) => errors.push(error),
  });
  return { poller, scheduler, states, errors, source };
}

describe("Poller", () => {
  it("loads both halves immediately on start", async () => {
    const { poller, source, scheduler } = setup();
    poller.start();
    await flush();
    expect(source.loadIssueAndComments).toHaveBeenCalledTimes(1);
    expect(source.loadTasks).toHaveBeenCalledTimes(1);
    expect(scheduler.size).toBe(2);
    poller.stop();
  });

  it("emits a merged state carrying issue, comments and tasks", async () => {
    const { poller, states } = setup();
    poller.start();
    await flush();
    const last = states.at(-1);
    expect(last?.issue.revision).toBe(1);
    expect(last?.comments).toHaveLength(1);
    expect(last?.tasks).toHaveLength(1);
    expect(last?.issueLoadedAt).toBeGreaterThan(0);
    expect(last?.tasksLoadedAt).toBeGreaterThan(0);
    poller.stop();
  });

  it("reloads the issue stream on the interval and keeps the tasks from before", async () => {
    const { poller, scheduler, states } = setup();
    poller.start();
    await flush();
    scheduler.advance(DEFAULT_INTERVALS.issue);
    scheduler.fire();
    await flush();
    const last = states.at(-1);
    expect(last?.issue.revision).toBe(2);
    expect(last?.tasks).toHaveLength(1);
    poller.stop();
  });

  it("refresh() ticks both halves without waiting for the interval", async () => {
    const { poller, source } = setup();
    poller.start();
    await flush();
    poller.refresh();
    await flush();
    expect(source.loadIssueAndComments).toHaveBeenCalledTimes(2);
    expect(source.loadTasks).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("emits nothing while the first issue load is failing", async () => {
    const source = dataSource({
      loadIssueAndComments: vi.fn(async () => {
        throw new Error("backend restarting");
      }),
    });
    const { poller, states, errors } = setup({ source });
    poller.start();
    await flush();
    expect(errors).toHaveLength(1);
    expect(states).toHaveLength(0);
    poller.stop();
  });

  it("survives a failing tick and keeps rendering the last good state", async () => {
    let fail = false;
    const source = dataSource({
      loadIssueAndComments: vi.fn(async () => {
        if (fail) throw new Error("backend restarting");
        return { issue: makeIssue({ revision: 9 }), comments: [] };
      }),
    });
    const { poller, errors, states, scheduler } = setup({ source });
    poller.start();
    await flush();
    expect(states.at(-1)?.issue.revision).toBe(9);

    fail = true;
    scheduler.fire();
    await flush();
    expect(errors).toHaveLength(1);
    expect(states.at(-1)?.issue.revision).toBe(9);
    expect(states.at(-1)?.tasks).toHaveLength(1);

    fail = false;
    scheduler.fire();
    await flush();
    expect(errors).toHaveLength(1);
    expect(states.at(-1)?.issue.revision).toBe(9);
    poller.stop();
  });

  it("stops cleanly and ignores later interval fires", async () => {
    const { poller, scheduler, source } = setup();
    poller.start();
    await flush();
    poller.stop();
    expect(scheduler.size).toBe(0);
    scheduler.fire();
    await flush();
    expect(source.loadIssueAndComments).toHaveBeenCalledTimes(1);
    expect(source.loadTasks).toHaveBeenCalledTimes(1);
  });

  it("does not stack overlapping issue loads", async () => {
    const gate = deferred();
    const source = dataSource({
      loadIssueAndComments: vi.fn(async () => {
        await gate.promise;
        return { issue: makeIssue(), comments: [] };
      }),
    });
    const { poller, source: used } = setup({ source });
    poller.start();
    await flush();
    poller.refresh();
    await flush();
    // The second tick is dropped while the first is still in flight.
    expect(used.loadIssueAndComments).toHaveBeenCalledTimes(1);
    gate.resolve();
    await flush();
    poller.stop();
  });

  it("holds a task snapshot that lands before the issue", async () => {
    // Regression: the two ticks start together, so the task half can resolve
    // first. Emitting a state with `issue: undefined` crashed every consumer
    // that dereferences `issue.id` on the very next render.
    const issueGate = deferred();
    const source = dataSource({
      loadIssueAndComments: vi.fn(async () => {
        await issueGate.promise;
        return { issue: makeIssue(), comments: [] };
      }),
      loadTasks: vi.fn(async () => [makeTask()]),
    });
    const { poller, states } = setup({ source });
    poller.start();
    await flush();
    expect(states).toHaveLength(0);

    issueGate.resolve();
    await flush();
    expect(states).toHaveLength(1);
    expect(states[0]?.issue.identifier).toBe("AIDL-3");
    expect(states[0]?.tasks).toHaveLength(1);
    poller.stop();
  });

  it("does not start twice", async () => {
    const { poller, source } = setup();
    poller.start();
    poller.start();
    await flush();
    expect(source.loadIssueAndComments).toHaveBeenCalledTimes(1);
    poller.stop();
  });
});
