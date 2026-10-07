/**
 * Delivery signature check (relay-protocol §1, the "署名漂移" row).
 *
 * A stage's delivery comment should be authored by the persona that was
 * dispatched. When it is not — measured in the DEMO-7 run — the thread no
 * longer says who produced the artifact, and the phase review is checking the
 * wrong name. The protocol's remedy is the §5 recovery path, so this is a
 * detector that feeds the alert, not an action.
 */

export type AuthorshipStatus = "ok" | "drifted" | "unknown";

export interface AuthorshipInput {
  /** Agent name the leader dispatched for this stage. */
  readonly dispatchedPersona: string;
  /** `Comment.author_type` on the delivery comment. */
  readonly authorType: string;
  /** Resolved name of the author, or null when the id is not in the roster. */
  readonly authorName: string | null;
}

export interface AuthorshipVerdict {
  readonly status: AuthorshipStatus;
  readonly detail: string;
}

export function checkAuthorship(input: AuthorshipInput): AuthorshipVerdict {
  if (input.authorType !== "agent") {
    return {
      status: "drifted",
      detail: `delivery was authored by a ${input.authorType}, not the dispatched persona ${input.dispatchedPersona}`,
    };
  }
  if (input.authorName === null) {
    return {
      status: "unknown",
      detail: `delivery author id is not in the roster — cannot confirm it was ${input.dispatchedPersona}`,
    };
  }
  if (input.authorName !== input.dispatchedPersona) {
    return {
      status: "drifted",
      detail: `delivery authored by ${input.authorName}, but ${input.dispatchedPersona} was dispatched`,
    };
  }
  return { status: "ok", detail: `delivery authored by the dispatched persona` };
}
