// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  CONSOLE_WRITABLE_STATUSES,
  RedLineError,
  assertConsoleWritableStatus,
  isBacklogTrap,
  isConsoleWritableStatus,
  isTerminalStatus,
} from "./red-lines";

describe("the console's writable status set", () => {
  it("is exactly `done`", () => {
    // The console acts as the human, so `done` is the single status it may
    // write. Anything wider would let it impersonate an agent's state change.
    expect(CONSOLE_WRITABLE_STATUSES).toEqual(["done"]);
  });

  it("permits done", () => {
    expect(isConsoleWritableStatus("done")).toBe(true);
    expect(() => assertConsoleWritableStatus("done")).not.toThrow();
  });

  it("refuses backlog with the trigger-freeze reason", () => {
    expect(isConsoleWritableStatus("backlog")).toBe(false);
    expect(() => assertConsoleWritableStatus("backlog")).toThrow(RedLineError);
    expect(() => assertConsoleWritableStatus("backlog")).toThrow(/pending-assignment/);
  });

  it("refuses in_progress and in_review with their own reasons", () => {
    expect(() => assertConsoleWritableStatus("in_progress")).toThrow(/must not write/);
    expect(() => assertConsoleWritableStatus("in_review")).toThrow(/squad leader/);
  });

  it("refuses any other status with a generic message", () => {
    expect(() => assertConsoleWritableStatus("blocked")).toThrow(/may only write done/);
    expect(() => assertConsoleWritableStatus("todo")).toThrow(RedLineError);
  });
});

describe("status classifiers", () => {
  it("identifies the backlog trap", () => {
    expect(isBacklogTrap("backlog")).toBe(true);
    expect(isBacklogTrap("todo")).toBe(false);
  });

  it("identifies terminal statuses", () => {
    expect(isTerminalStatus("done")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("in_review")).toBe(false);
  });
});
