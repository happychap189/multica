import type { AgentTask } from "@multica/core/types/agent";
import type { Comment } from "@multica/core/types/comment";
import type { Issue } from "@multica/core/types/issue";

/**
 * The refresh loop.
 *
 * Polling is the source of truth, not a fallback: every write is followed by a
 * re-read anyway, the realtime socket has no replay and drops frames across
 * reconnects, and the protocol's own monitoring section describes an API-only
 * poll. A websocket, when attached, is only an accelerator that asks the loop to
 * tick sooner.
 *
 * Timers and the clock are injected so the loop is testable without waiting.
 */

export interface PollState {
  readonly issue: Issue;
  readonly comments: readonly Comment[];
  readonly tasks: readonly AgentTask[];
  /** Epoch milliseconds of the last successful load of any kind. */
  readonly updatedAt: number;
  /** Epoch milliseconds of the last successful issue+comments load. */
  readonly issueLoadedAt: number;
  /** Epoch milliseconds of the last successful task snapshot load. */
  readonly tasksLoadedAt: number;
}

export interface PollDataSource {
  loadIssueAndComments(): Promise<{ issue: Issue; comments: readonly Comment[] }>;
  loadTasks(): Promise<readonly AgentTask[]>;
}

export interface Scheduler {
  setInterval(callback: () => void, ms: number): number;
  clearInterval(handle: number): void;
  now(): number;
}

export const systemScheduler: Scheduler = {
  setInterval: (callback, ms) => Number(setInterval(callback, ms)),
  clearInterval: (handle) => clearInterval(handle),
  now: () => Date.now(),
};

export interface PollIntervals {
  /** Issue + comment stream — the anchors live here, so it ticks fastest. */
  readonly issue: number;
  /** Task snapshot — heavier, and the stall arms tolerate the lag. */
  readonly tasks: number;
}

export const DEFAULT_INTERVALS: PollIntervals = Object.freeze({
  issue: 5_000,
  tasks: 15_000,
});

export interface PollerOptions {
  readonly source: PollDataSource;
  readonly onState: (state: PollState) => void;
  readonly onError: (error: unknown) => void;
  readonly scheduler?: Scheduler;
  readonly intervals?: PollIntervals;
}

export class Poller {
  private readonly source: PollDataSource;
  private readonly onState: (state: PollState) => void;
  private readonly onError: (error: unknown) => void;
  private readonly scheduler: Scheduler;
  private readonly intervals: PollIntervals;

  private handle: number | null = null;
  private issueHandle: number | null = null;
  private tasksHandle: number | null = null;
  private running = false;
  private inFlight = false;
  private state: PollState | null = null;
  /** Task snapshot that landed before the first issue load. */
  private earlyTasks: readonly AgentTask[] | null = null;

  constructor(options: PollerOptions) {
    this.source = options.source;
    this.onState = options.onState;
    this.onError = options.onError;
    this.scheduler = options.scheduler ?? systemScheduler;
    this.intervals = options.intervals ?? DEFAULT_INTERVALS;
  }

  current(): PollState | null {
    return this.state;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tickIssue();
    void this.tickTasks();
    this.issueHandle = this.scheduler.setInterval(() => void this.tickIssue(), this.intervals.issue);
    this.tasksHandle = this.scheduler.setInterval(() => void this.tickTasks(), this.intervals.tasks);
  }

  stop(): void {
    this.running = false;
    for (const handle of [this.issueHandle, this.tasksHandle, this.handle]) {
      if (handle !== null) this.scheduler.clearInterval(handle);
    }
    this.issueHandle = null;
    this.tasksHandle = null;
    this.handle = null;
  }

  /** Ask for an immediate pass — the `r` key, or a realtime frame. */
  refresh(): void {
    void this.tickIssue();
    void this.tickTasks();
  }

  private merge(partial: {
    issue?: Issue;
    comments?: readonly Comment[];
    tasks?: readonly AgentTask[];
  }): void {
    // The issue and task ticks start together, so the task snapshot can land
    // first. A state built before the issue exists would carry `issue:
    // undefined`, which every consumer dereferences immediately — hold the
    // early snapshot instead of emitting a half-formed state.
    if (this.state === null) {
      if (partial.tasks !== undefined) this.earlyTasks = partial.tasks;
      if (partial.issue === undefined) return;
    }

    const now = this.scheduler.now();
    const previous = this.state;
    const issue = partial.issue ?? previous?.issue;
    if (issue === undefined) return;

    this.state = {
      issue,
      comments: partial.comments ?? previous?.comments ?? [],
      tasks: partial.tasks ?? previous?.tasks ?? this.earlyTasks ?? [],
      updatedAt: now,
      issueLoadedAt: partial.issue !== undefined ? now : (previous?.issueLoadedAt ?? 0),
      tasksLoadedAt:
        partial.tasks !== undefined
          ? now
          : (previous?.tasksLoadedAt ?? (this.earlyTasks !== null ? now : 0)),
    };
    this.earlyTasks = null;
    this.onState(this.state);
  }

  private async tickIssue(): Promise<void> {
    if (!this.running || this.inFlight) return;
    this.inFlight = true;
    try {
      const { issue, comments } = await this.source.loadIssueAndComments();
      this.merge({ issue, comments });
    } catch (error) {
      // A failed tick is not fatal: a backend restart or a transient 5xx must
      // not take the console down mid-run.
      this.onError(error);
    } finally {
      this.inFlight = false;
    }
  }

  private async tickTasks(): Promise<void> {
    if (!this.running) return;
    try {
      const tasks = await this.source.loadTasks();
      this.merge({ tasks });
    } catch (error) {
      this.onError(error);
    }
  }
}
