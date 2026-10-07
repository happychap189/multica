// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  parseArgs,
  parseCli,
  parseEnvironment,
  type Environment,
} from "./env";

const ENV: Environment = {
  MULTICA_SERVER_URL: "http://127.0.0.1:18700",
  MULTICA_API_TOKEN: "mul_test",
  MULTICA_WORKSPACE_ID: "970c5db2-e8b6-4221-95f3-8d4dafaa6491",
};

function argsOf(argv: readonly string[]) {
  const result = parseArgs(argv);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result.args;
}

describe("parseArgs", () => {
  it("requires --issue", () => {
    const result = parseArgs([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("--issue");
  });

  it("accepts the separate-value form", () => {
    const args = argsOf(["--issue", "MUL-123"]);
    expect(args.issue).toBe("MUL-123");
    expect(args.readOnly).toBe(false);
    expect(args.stateFile).toBeNull();
  });

  it("accepts the inline `=` form", () => {
    expect(argsOf(["--issue=MUL-123"]).issue).toBe("MUL-123");
    expect(argsOf(["--issue=MUL-123", "--state-file=/tmp/x.json"]).stateFile).toBe(
      "/tmp/x.json",
    );
  });

  it("collects flags regardless of position", () => {
    const args = argsOf(["--read-only", "--issue", "MUL-1", "--ws"]);
    expect(args).toMatchObject({ readOnly: true, ws: true, issue: "MUL-1" });
  });

  it("rejects an unknown argument rather than ignoring it", () => {
    const result = parseArgs(["--issue", "MUL-1", "--readonly"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("unknown argument");
  });

  it("skips a bare `--` separator as package managers forward it", () => {
    // `pnpm --filter … dev -- --issue MUL-1` arrives as ["--", "--issue", "MUL-1"].
    const args = argsOf(["--", "--issue", "MUL-1", "--read-only"]);
    expect(args).toMatchObject({ issue: "MUL-1", readOnly: true });
  });

  it("rejects a valued flag with no value", () => {
    expect(parseArgs(["--issue"]).ok).toBe(false);
    expect(parseArgs(["--issue", "--read-only"]).ok).toBe(false);
    expect(parseArgs(["--issue="]).ok).toBe(false);
  });

  it("rejects a value given to a boolean flag", () => {
    const result = parseArgs(["--issue", "MUL-1", "--ws=1"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("takes no value");
  });

  it("refuses read-only combined with recovery actions", () => {
    const result = parseArgs([
      "--issue",
      "MUL-1",
      "--read-only",
      "--allow-recovery-actions",
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("mutually exclusive");
  });
});

describe("parseEnvironment", () => {
  it("accepts a complete environment", () => {
    const result = parseEnvironment(ENV);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.workspace).toBe(ENV.MULTICA_WORKSPACE_ID);
  });

  it("names every missing variable", () => {
    const result = parseEnvironment({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("MULTICA_SERVER_URL");
      expect(result.error).toContain("MULTICA_API_TOKEN");
      expect(result.error).toContain("MULTICA_WORKSPACE_ID");
    }
  });

  it("treats blank values as missing", () => {
    const result = parseEnvironment({ ...ENV, MULTICA_API_TOKEN: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("MULTICA_API_TOKEN");
  });

  it("strips trailing slashes from the server URL", () => {
    const result = parseEnvironment({ ...ENV, MULTICA_SERVER_URL: "http://host:1///" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.env.serverUrl).toBe("http://host:1");
  });
});

describe("parseCli", () => {
  it("combines argv and environment", () => {
    const result = parseCli(["--issue", "MUL-9", "--read-only"], ENV);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.env.serverUrl).toBe("http://127.0.0.1:18700");
      expect(result.args).toMatchObject({ issue: "MUL-9", readOnly: true });
    }
  });

  it("reports an argv problem before an environment problem", () => {
    const result = parseCli([], {});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("--issue");
  });
});
