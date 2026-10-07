import { PHASE_STAGE_COUNTS, TOTAL_SLOTS, stageForSlot } from "../config/stages";
import type { PhaseNumber } from "../config/phases";

import { slotKey, type Anchor } from "./anchor";

/**
 * One anchor as it appears in the issue timeline.
 *
 * `isReply` matters: a P5 leader posted an anchor as an in-thread reply once
 * (71 playbook §71.6 #6), so a scanner that only reads top-level comments
 * undercounts. Occurrences are expected in chronological order; `createdAt`
 * decides "latest", with input order breaking ties.
 */
export interface AnchorOccurrence {
  readonly anchor: Anchor;
  readonly commentId: string;
  readonly createdAt: string;
  readonly isReply: boolean;
}

export interface SlotState {
  readonly key: string;
  readonly phase: PhaseNumber;
  readonly indexInPhase: number;
  readonly slug: string;
  /** Total anchors seen for this slot, including rework re-issues. */
  readonly occurrences: number;
  /** Sorted rework revisions seen; empty when never reworked. */
  readonly revisions: readonly number[];
  /** Non-protocol qualifiers seen on this slot (`skip`, …). */
  readonly variants: readonly string[];
  readonly last: AnchorOccurrence;
  /** Slug the 33-stage table expects at this slot, or null if the slot is off-table. */
  readonly expectedSlug: string | null;
  readonly slugMatchesTable: boolean;
  /** A repeat of the slot with NO rework marker — the drift the protocol forbids. */
  readonly duplicatedWithoutRevision: boolean;
  readonly phaseCountMismatch: boolean;
  readonly indexOutOfRange: boolean;
}

export interface SlotSummary {
  /** One entry per distinct slot, in first-seen order. */
  readonly slots: readonly SlotState[];
  readonly uniqueCount: number;
  readonly totalSlots: number;
  readonly filledByPhase: Readonly<Record<PhaseNumber, number>>;
  /** Latest anchor overall, or null when the timeline carries none. */
  readonly last: AnchorOccurrence | null;
  /** Human-readable drift findings; empty when the timeline is clean. */
  readonly anomalies: readonly string[];
  /**
   * Informational notes — chiefly that a phase ran a reduced path. Not drift.
   */
  readonly notes: readonly string[];
  /** Per-phase slot total as the anchors themselves declare it. */
  readonly observedPhaseCounts: Readonly<Partial<Record<PhaseNumber, number>>>;
}

const PHASE_ORDER: readonly PhaseNumber[] = [1, 2, 3, 4, 5];

function isAfter(a: AnchorOccurrence, b: AnchorOccurrence): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return true; // equal timestamps: later input position wins
}

/**
 * A phase's anchors declare their own denominator (`{n}` in `[P{p} {i}/{n}]`).
 * Protocol §3.5 defines `n` as the *current run's* stage count for the phase,
 * not the full-33 count — the 11 profile-entry squads legitimately run shorter
 * phases. So a phase whose anchors consistently use a different `n` is on a
 * reduced path, and comparing its slugs against the full-33 table would report
 * drift on every such run.
 *
 * Returns the phase's mode plus the denominators seen, so a *mixed* set (which
 * really is drift) can still be told apart from a consistent alternative.
 */
function phasePathMode(group: readonly AnchorOccurrence[]): {
  mode: "full-33" | "reduced" | "mixed";
  counts: number[];
} {
  const first = group[0];
  if (!first) return { mode: "full-33", counts: [] };
  const phase = first.anchor.phase;
  const counts = [...new Set(group.map((occurrence) => occurrence.anchor.stageCount))].sort(
    (a, b) => a - b,
  );
  if (counts.length > 1) return { mode: "mixed", counts };
  const only = counts[0];
  if (only === undefined) return { mode: "full-33", counts: [] };
  return { mode: only === PHASE_STAGE_COUNTS[phase] ? "full-33" : "reduced", counts };
}

export function summarizeSlots(occurrences: readonly AnchorOccurrence[]): SlotSummary {
  const groups = new Map<string, AnchorOccurrence[]>();
  for (const occurrence of occurrences) {
    const key = slotKey(occurrence.anchor);
    const existing = groups.get(key);
    if (existing) existing.push(occurrence);
    else groups.set(key, [occurrence]);
  }

  // A phase's mode is decided across all of its slots, not per slot: one slot
  // using a different denominator says nothing until the others agree.
  const byPhase = new Map<PhaseNumber, AnchorOccurrence[]>();
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) continue;
    const bucket = byPhase.get(first.anchor.phase);
    if (bucket) bucket.push(...group);
    else byPhase.set(first.anchor.phase, [...group]);
  }
  const modes = new Map<PhaseNumber, { mode: string; counts: number[] }>();
  for (const [phase, group] of byPhase) modes.set(phase, phasePathMode(group));

  const slots: SlotState[] = [];
  const anomalies: string[] = [];
  const notes: string[] = [];
  const observedPhaseCounts: Partial<Record<PhaseNumber, number>> = {};
  const filledByPhase: Record<PhaseNumber, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const [key, group] of groups) {
    const first = group[0];
    if (first === undefined) continue;
    const { phase, indexInPhase, slug, stageCount } = first.anchor;

    let last = first;
    const revisions = new Set<number>();
    const variants = new Set<string>();
    let unmarked = 0;
    for (const occurrence of group) {
      if (isAfter(occurrence, last)) last = occurrence;
      const { revision, marker, markerIsVariant } = occurrence.anchor;
      if (revision !== null) revisions.add(revision);
      else unmarked += 1;
      if (markerIsVariant && marker !== null) variants.add(marker);
    }

    const expected = stageForSlot(phase, indexInPhase);
    const expectedSlug = expected?.slug ?? null;
    const phaseCount = PHASE_STAGE_COUNTS[phase];
    const phaseMode = modes.get(phase)?.mode ?? "full-33";
    const comparingToTable = phaseMode === "full-33";

    observedPhaseCounts[phase] = stageCount;

    const state: SlotState = {
      key,
      phase,
      indexInPhase,
      slug,
      occurrences: group.length,
      revisions: [...revisions].sort((a, b) => a - b),
      variants: [...variants].sort(),
      last,
      expectedSlug,
      slugMatchesTable: expectedSlug === slug,
      duplicatedWithoutRevision: unmarked > 1,
      phaseCountMismatch: stageCount !== phaseCount,
      indexOutOfRange: indexInPhase < 1 || indexInPhase > stageCount,
    };
    slots.push(state);
    filledByPhase[phase] += 1;

    const label = `[P${phase} ${indexInPhase}/${stageCount}] ${slug}`;
    if (comparingToTable && expectedSlug === null) {
      anomalies.push(`${label}: no stage occupies this slot in the 33-stage table`);
    } else if (comparingToTable && !state.slugMatchesTable) {
      anomalies.push(`${label}: table expects '${expectedSlug}' at this slot`);
    }
    if (state.duplicatedWithoutRevision) {
      anomalies.push(`${label}: ${unmarked} anchors with no rework marker (r-n) — revision drift`);
    }
    if (state.variants.length > 0) {
      anomalies.push(
        `${label}: non-protocol anchor marker (${state.variants.join(", ")}) — counted, but the protocol only defines (rN)`,
      );
    }
    if (state.indexOutOfRange) {
      anomalies.push(`${label}: index ${indexInPhase} outside phase ${phase} range`);
    }
  }

  for (const [phase, info] of modes) {
    if (info.mode === "reduced") {
      const only = info.counts[0];
      notes.push(
        `P${phase} ran a reduced path (${only} stages; full-33 has ${PHASE_STAGE_COUNTS[phase]}) — slot/slug table checks skipped for this phase`,
      );
    } else if (info.mode === "mixed") {
      anomalies.push(
        `P${phase} anchors disagree on their stage count (${info.counts.join(", ")}) — genuine drift`,
      );
    }
  }

  let last: AnchorOccurrence | null = null;
  for (const occurrence of occurrences) {
    if (last === null || isAfter(occurrence, last)) last = occurrence;
  }

  return {
    slots,
    uniqueCount: slots.length,
    totalSlots: TOTAL_SLOTS,
    filledByPhase,
    last,
    anomalies,
    notes,
    observedPhaseCounts,
  };
}

/** Phases whose every slot is filled — the precondition for a handoff. */
export function completedPhases(summary: SlotSummary): readonly PhaseNumber[] {
  return PHASE_ORDER.filter(
    (phase) => summary.filledByPhase[phase] === PHASE_STAGE_COUNTS[phase],
  );
}

/** Whether `phase`'s every slot is filled. */
export function isPhaseComplete(summary: SlotSummary, phase: PhaseNumber): boolean {
  return summary.filledByPhase[phase] === PHASE_STAGE_COUNTS[phase];
}
