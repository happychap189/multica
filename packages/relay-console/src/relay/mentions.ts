import { parseMentions } from "@multica/core/issues/comment-trigger-outcomes";

/**
 * Mention construction and detection.
 *
 * The relay has two disjoint mention namespaces (relay-protocol §2):
 *   - human → squad  : the phase owner wakes the next squad
 *   - leader → member: dispatch inside a squad
 *
 * Both are markdown links of the form `[@Label](mention://<kind>/<uuid>)`. The
 * literal must be built verbatim: a plain-text `@Name`, or a short form like
 * `n/<id>`, returns HTTP 201 with zero trigger outcomes and zero tasks — a
 * silent no-op that the protocol's whole recovery section exists to work
 * around. Ids are only ever copied from the API, never typed.
 *
 * Parsing reuses `@multica/core`'s parser so the console agrees with the
 * server's own regex (`server/internal/util/mention.go`) by construction.
 */

export type MentionKind = "squad" | "agent";

export interface MentionTarget {
  readonly kind: MentionKind;
  /** Exact entity name, matched verbatim against the roster. */
  readonly name: string;
  readonly id: string;
}

/** Build the exact literal that wakes `target`. Do not reformat the result. */
export function buildMentionLiteral(target: MentionTarget): string {
  return `[@${target.name}](mention://${target.kind}/${target.id})`;
}

export interface ParsedMention {
  readonly label: string;
  readonly kind: string;
  readonly id: string;
}

/** Every mention in a body, in order, across both namespaces. */
export function mentionsIn(content: string): ParsedMention[] {
  return parseMentions(content).map((mention) => ({
    label: mention.label,
    kind: mention.type,
    id: mention.id,
  }));
}

/** Mentions that actually wake an agent or a squad (`issue`/`all` links do not). */
export function triggeringMentions(content: string): ParsedMention[] {
  return mentionsIn(content).filter((m) => m.kind === "squad" || m.kind === "agent");
}

export function hasTriggeringMention(content: string): boolean {
  return triggeringMentions(content).length > 0;
}

/**
 * Whether `content` explicitly mentions `target`.
 *
 * An exact `(kind, id)` match is required — a mention of a different squad, or
 * a plain-text `@Name`, does not count. This is the signal the recovery
 * detector keys on when a delivery reply failed to wake its leader.
 */
export function findExplicitMention(content: string, target: MentionTarget): boolean {
  return triggeringMentions(content).some(
    (mention) => mention.kind === target.kind && mention.id === target.id,
  );
}
