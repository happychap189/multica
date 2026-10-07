import { unhandledCommentTriggerOutcomes } from "@multica/core/issues/comment-trigger-outcomes";
import type { CommentTriggerOutcome } from "@multica/core/types/comment";

import { hasTriggeringMention } from "./mentions";

/**
 * Interpretation of the `trigger_outcomes` field on a comment create/edit
 * response, for a comment the console itself just posted.
 *
 * Why this cannot be a thin wrapper over `unhandledCommentTriggerOutcomes`:
 * that helper maps BOTH "the field is missing" and "the field is an empty
 * array" to `[]`. Absence is the dangerous case — the field is documented as
 * present only on create/edit responses and omitted by older servers, so
 * treating silence as success would let a silently-unwoken handoff pass as
 * verified. The server's own failure mode is silent: a mistyped mention UUID
 * yields HTTP 201, zero outcomes, zero tasks (71 playbook §71.6 #2).
 *
 * Hence four distinct verdicts, only one of which is success. Anything that is
 * not `handled` requires the caller to run the task-snapshot probe before
 * believing a wake-up happened.
 */
export type TriggerVerdict =
  /** The body carried no agent/squad mention — nothing to verify. */
  | { readonly kind: "no-mentions" }
  /** Reported outcomes are missing, malformed, or empty while a mention was sent. */
  | { readonly kind: "unverified"; readonly reason: string }
  /** Every reported outcome is a known-handled status. */
  | { readonly kind: "handled"; readonly outcomes: readonly CommentTriggerOutcome[] }
  /** At least one outcome is blocked or unrecognized. */
  | { readonly kind: "unhandled"; readonly outcomes: readonly CommentTriggerOutcome[] };

/** Statuses that mean the mention was genuinely picked up. Mirrors core's whitelist. */
const HANDLED_STATUSES = new Set(["queued", "coalesced", "deferred", "steered"]);

function outcomesField(raw: unknown): { present: boolean; value: unknown } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { present: false, value: undefined };
  }
  return {
    present: Object.prototype.hasOwnProperty.call(raw, "trigger_outcomes"),
    value: (raw as Record<string, unknown>)["trigger_outcomes"],
  };
}

export function interpretTriggerOutcomes(rawResponse: unknown, content: string): TriggerVerdict {
  if (!hasTriggeringMention(content)) {
    return { kind: "no-mentions" };
  }

  const field = outcomesField(rawResponse);
  if (!field.present) {
    return {
      kind: "unverified",
      reason: "server did not report trigger_outcomes (older build) — probe required",
    };
  }
  if (!Array.isArray(field.value)) {
    return {
      kind: "unverified",
      reason: "trigger_outcomes was not an array — probe required",
    };
  }
  if (field.value.length === 0) {
    return {
      kind: "unverified",
      reason: "trigger_outcomes was empty for a mention-bearing comment — probe required",
    };
  }

  // Core's parser drops malformed entries individually rather than failing the
  // set, and its unhandled filter is a whitelist: an unknown or empty status
  // never counts as success.
  const unhandled = unhandledCommentTriggerOutcomes(field.value);
  if (unhandled.length > 0) {
    const outcomes = field.value.flatMap((item) => {
      const parsed = parseOutcome(item);
      return parsed ? [parsed] : [];
    });
    return { kind: "unhandled", outcomes };
  }

  const outcomes = field.value.flatMap((item) => {
    const parsed = parseOutcome(item);
    return parsed ? [parsed] : [];
  });
  return { kind: "handled", outcomes };
}

function parseOutcome(item: unknown): CommentTriggerOutcome | null {
  if (typeof item !== "object" || item === null) return null;
  const record = item as Record<string, unknown>;
  const targetId = record["target_id"];
  if (typeof targetId !== "string") return null;
  return {
    target_type: typeof record["target_type"] === "string" ? record["target_type"] : "",
    target_id: targetId,
    status: typeof record["status"] === "string" ? record["status"] : "",
    reason_code: typeof record["reason_code"] === "string" ? record["reason_code"] : "",
  };
}

/** True when the verdict cannot be trusted without a task-snapshot probe. */
export function needsProbe(verdict: TriggerVerdict): boolean {
  return verdict.kind === "unverified";
}

/** True when the mention demonstrably did not wake its target. */
export function isFailure(verdict: TriggerVerdict): boolean {
  return verdict.kind === "unhandled";
}

/** One-line rendering for the action panel. */
export function describeVerdict(verdict: TriggerVerdict): string {
  switch (verdict.kind) {
    case "no-mentions":
      return "no mention to verify";
    case "unverified":
      return `unverified — ${verdict.reason}`;
    case "handled":
      return `handled: ${summarize(verdict.outcomes)}`;
    case "unhandled":
      return `NOT HANDLED: ${summarize(verdict.outcomes)}`;
  }
}

function summarize(outcomes: readonly CommentTriggerOutcome[]): string {
  if (outcomes.length === 0) return "(none)";
  return outcomes
    .map((outcome) => {
      const known = HANDLED_STATUSES.has(outcome.status);
      const reason = outcome.reason_code === "" ? "" : `/${outcome.reason_code}`;
      return `${outcome.target_type}:${outcome.target_id.slice(0, 8)}…=${outcome.status}${reason}${
        known ? "" : " (unrecognized)"
      }`;
    })
    .join(", ");
}
