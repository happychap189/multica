import type { PhaseNumber } from "../config/phases";

/**
 * Progress-anchor grammar (relay-protocol §3.5, tightened in the 71 playbook
 * §71.3.2 to a strict line anchor):
 *
 *   [P3 5/9] reverse-engineering done → next refined-mockups
 *   [P3 5/9] reverse-engineering done (r2) → next refined-mockups
 *   [P3 5/9] reverse-engineering done (skip) → next refined-mockups
 *
 * Notes on the shape:
 * - The arrow is U+2192 (`→`), not `->`.
 * - `{i}/{n}` is the position within the phase and the phase's stage count.
 * - `(rN)` marks a rework re-issue of the same slot; N starts at 2, because a
 *   first issue carries no marker.
 * - The trailing qualifier is NOT restricted to `(rN)`. Measured on the real
 *   AIDL-3 run: a leader marked a conditional stage `(skip)` when its contract
 *   resolved to the greenfield branch. Rejecting that spelling would drop a
 *   slot that genuinely exists and report a phantom "missing stage", so any
 *   alphanumeric qualifier parses; a non-rework one is flagged as a variant
 *   rather than silently accepted.
 * - The line must span the whole line: an anchor quoted inside prose is not an
 *   anchor, and treating it as one would corrupt the slot count.
 *
 * A string-typed source + per-call `RegExp` is deliberate: a shared global
 * regex carries `lastIndex` between `matchAll` calls and silently drops
 * matches (the same hazard documented in
 * `packages/core/issues/comment-trigger-outcomes.ts`).
 */
const ANCHOR_SOURCE =
  "^\\[P([1-5]) (\\d+)\\/(\\d+)\\] ([a-z0-9-]+) done(?: \\(([a-z0-9]+)\\))? → next (\\S+)$";

export interface Anchor {
  readonly phase: PhaseNumber;
  /** 1-based position within the phase — the `i`. */
  readonly indexInPhase: number;
  /** Stage count of the phase — the `n`. */
  readonly stageCount: number;
  readonly slug: string;
  /** Rework revision, or `null` for the first issue of a slot. */
  readonly revision: number | null;
  /** Raw qualifier text (`r2`, `skip`, …), or null when the anchor carries none. */
  readonly marker: string | null;
  /** True when the qualifier is not a protocol `(rN)` rework marker. */
  readonly markerIsVariant: boolean;
  /** `{next-slug}`, or `phase-summary` on a phase's final anchor. */
  readonly next: string;
  /** The matched line, verbatim. */
  readonly raw: string;
}

/** Parse a single line as an anchor. Returns null for anything that is not one. */
export function parseAnchorLine(line: string): Anchor | null {
  const match = new RegExp(ANCHOR_SOURCE).exec(line);
  if (!match) return null;

  const [, phaseText, indexText, countText, slug, markerText] = match;
  if (phaseText === undefined || indexText === undefined || countText === undefined) return null;
  if (slug === undefined) return null;

  const phase = Number(phaseText);
  const indexInPhase = Number(indexText);
  const stageCount = Number(countText);
  if (phase < 1 || phase > 5) return null;

  const marker = markerText ?? null;
  let revision: number | null = null;
  if (marker !== null) {
    const rework = /^r(\d+)$/.exec(marker);
    if (rework?.[1] !== undefined) {
      const parsed = Number(rework[1]);
      // A rework marker starts at r2: `(r1)` would duplicate the unmarked first
      // issue, and `(r0)` is meaningless. Either spelling is a malformed anchor
      // rather than a variant, because the qualifier claims to be a revision.
      if (parsed < 2) return null;
      revision = parsed;
    }
  }

  return {
    phase: phase as PhaseNumber,
    indexInPhase,
    stageCount,
    slug,
    revision,
    marker,
    markerIsVariant: marker !== null && revision === null,
    next: match[6] ?? "",
    raw: line,
  };
}

/**
 * Find the first anchor in a comment body.
 *
 * Anchors are top-level comments whose content is the anchor line, but a body
 * may carry a trailing newline (or a stray blank line), so each line is tried
 * in order rather than only the whole body.
 */
export function findAnchor(content: string): Anchor | null {
  for (const line of content.split("\n")) {
    const anchor = parseAnchorLine(line.trim());
    if (anchor) return anchor;
  }
  return null;
}

/** The slot identity an anchor occupies; rework revisions collapse into it. */
export function slotKey(anchor: Anchor): string {
  return `${anchor.phase}:${anchor.indexInPhase}:${anchor.slug}`;
}
