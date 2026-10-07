// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { makeTask, TEST_ISSUE_ID } from "../testing/fixtures";

import { describeProbe, probeForTask, type ProbeSource } from "./verify";

/** A clock whose progress is driven by the sleeps the probe performs. */
function fakeClock() {
  let value = 0;
  return {
    now: () => value,
    sleep: async (ms: number) => {
      value += ms;
    },
  };
}

function sourceFor(batches: readonly (readonly ReturnType<typeof makeTask>[])[]): ProbeSource {
  let index = 0;
  return {
    loadTasks: vi.fn(async () => {
      const batch = batches[Math.min(index, batches.length - 1)] ?? [];
      index += 1;
      return batch;
    }),
  };
}

describe("probeForTask", () => {
  it("finds a task that appears after the write", async () => {
    const clock = fakeClock();
    const source = sourceFor([[], [], [makeTask({ id: "new-task" })]]);
    const result = await probeForTask({
      source,
      issueId: TEST_ISSUE_ID,
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 60_000,
      intervalMs: 5_000,
    });
    expect(result.found).toBe(true);
    expect(result.task?.id).toBe("new-task");
    expect(result.polls).toBe(3);
  });

  it("ignores tasks that were already there before the write", async () => {
    const clock = fakeClock();
    const existing = makeTask({ id: "existing" });
    const source = sourceFor([[existing], [existing], [existing, makeTask({ id: "fresh" })]]);
    const result = await probeForTask({
      source,
      issueId: TEST_ISSUE_ID,
      baselineTaskIds: ["existing"],
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 60_000,
      intervalMs: 5_000,
    });
    expect(result.task?.id).toBe("fresh");
  });

  it("ignores another issue's tasks", async () => {
    const clock = fakeClock();
    const source = sourceFor([[makeTask({ issue_id: "elsewhere" })]]);
    const result = await probeForTask({
      source,
      issueId: TEST_ISSUE_ID,
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 10_000,
      intervalMs: 5_000,
    });
    expect(result.found).toBe(false);
  });

  it("restricts the probe to the expected agents when given", async () => {
    const clock = fakeClock();
    const source = sourceFor([
      [makeTask({ id: "other-agent", agent_id: "stranger" })],
      [makeTask({ id: "right-agent", agent_id: "member-1" })],
    ]);
    const result = await probeForTask({
      source,
      issueId: TEST_ISSUE_ID,
      agentIds: ["member-1"],
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 30_000,
      intervalMs: 5_000,
    });
    expect(result.task?.id).toBe("right-agent");
  });

  it("gives up at the timeout and reports what it waited", async () => {
    const clock = fakeClock();
    const source = sourceFor([[]]);
    const result = await probeForTask({
      source,
      issueId: TEST_ISSUE_ID,
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 20_000,
      intervalMs: 5_000,
    });
    expect(result.found).toBe(false);
    expect(result.task).toBeNull();
    expect(result.waitedMs).toBeGreaterThanOrEqual(20_000);
  });

  it("keeps polling through transient load failures", async () => {
    const clock = fakeClock();
    let calls = 0;
    const source: ProbeSource = {
      loadTasks: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error("transient");
        return [makeTask({ id: "recovered" })];
      }),
    };
    const result = await probeForTask({
      source,
      issueId: TEST_ISSUE_ID,
      now: clock.now,
      sleep: clock.sleep,
      timeoutMs: 30_000,
      intervalMs: 5_000,
    });
    expect(result.found).toBe(true);
    expect(result.task?.id).toBe("recovered");
  });
});

describe("describeProbe", () => {
  it("explains a hit", () => {
    const text = describeProbe(
      { found: true, task: makeTask({ id: "t9" }), waitedMs: 10_000, polls: 2 },
      "aidlc-developer",
    );
    expect(text).toContain("t9");
    expect(text).toContain("aidlc-developer");
  });

  it("explains a miss in the terms that matter — accepted but not woken", () => {
    const text = describeProbe({ found: false, task: null, waitedMs: 90_000, polls: 18 }, "squad");
    expect(text).toContain("NO task appeared");
    expect(text).toContain("201");
  });
});
