import type { PhaseNumber } from "./phases";

/**
 * The 33-stage structure of a full relay (`full-33`), as the runtime actually
 * runs it.
 *
 * Source of truth: the per-squad `stage 顺序表` tables in
 * `docs/my-best-practice/templates/aidlc-relay-pack/squad-instructions/phase-*.md`.
 * Those tables are what gets injected into the leader's context, so they — not
 * the prose artifact lists elsewhere in the pack — decide the order stages run
 * in and therefore which `(phase, indexInPhase)` pair an anchor's slug must
 * match.
 *
 * Known discrepancy (deliberately not "fixed" here): `relay-protocol.md` §4's
 * P3 checklist lists #17 as `contract-summary` and #18 as `unit-of-work`,
 * inverting #17/#18 relative to `phase-3-inception.md`. The squad instruction
 * is self-consistent and gives its reasoning ("refs 自序 2.7/2.8"; contract
 * design consumes the unit-of-work artifacts), so it wins here. The console
 * compares the `(indexInPhase, slug)` pair found in an anchor against this
 * table and reports a mismatch as drift rather than silently accepting either
 * ordering.
 */
export interface StageSpec {
  /** Global ordinal 1..33 — the `#N` used across the pack and its docs. */
  readonly ordinal: number;
  readonly phase: PhaseNumber;
  /** 1-based position within the phase — the `i` in `[P{p} {i}/{n}]`. */
  readonly indexInPhase: number;
  readonly slug: string;
}

/** Stage count per phase; the `n` in `[P{p} {i}/{n}]`. */
export const PHASE_STAGE_COUNTS: Readonly<Record<PhaseNumber, number>> = Object.freeze({
  1: 3,
  2: 7,
  3: 9,
  4: 7,
  5: 7,
});

// prettier-ignore
const TABLE: readonly (readonly [PhaseNumber, string])[] = [
  [1, "state-init"],
  [1, "workspace-detection"],
  [1, "workspace-scaffold"],

  [2, "intent-capture"],
  [2, "market-research"],
  [2, "feasibility"],
  [2, "rough-mockups"],
  [2, "scope-definition"],
  [2, "team-formation"],
  [2, "approval-handoff"],

  [3, "requirements-analysis"],
  [3, "user-stories"],
  [3, "domain-design"],
  [3, "practices-discovery"],
  [3, "reverse-engineering"],
  [3, "refined-mockups"],
  [3, "units-generation"],
  [3, "contract-design"],
  [3, "delivery-planning"],

  [4, "functional-design"],
  [4, "nfr-requirements"],
  [4, "nfr-design"],
  [4, "infrastructure-design"],
  [4, "code-generation"],
  [4, "build-and-test"],
  [4, "ci-pipeline"],

  [5, "environment-provisioning"],
  [5, "deployment-pipeline"],
  [5, "deployment-execution"],
  [5, "observability-setup"],
  [5, "performance-validation"],
  [5, "feedback-optimization"],
  [5, "incident-response"],
];

export const STAGES: readonly StageSpec[] = Object.freeze(
  TABLE.map(([phase, slug], position) => {
    const indexInPhase = TABLE.slice(0, position).filter(([p]) => p === phase).length + 1;
    return Object.freeze({ ordinal: position + 1, phase, indexInPhase, slug });
  }),
);

/** Total slots in a full relay. */
export const TOTAL_SLOTS = STAGES.length;

/** `{next}` value on a phase's final anchor (relay-protocol §3.5). */
export const PHASE_SUMMARY_SLUG = "phase-summary";

const BY_SLOT = new Map<string, StageSpec>(
  STAGES.map((stage) => [`${stage.phase}:${stage.indexInPhase}`, stage]),
);

/** The stage occupying `[P{phase} {indexInPhase}/{n}]`, or undefined if none does. */
export function stageForSlot(phase: number, indexInPhase: number): StageSpec | undefined {
  return BY_SLOT.get(`${phase}:${indexInPhase}`);
}

const BY_SLUG = new Map<string, StageSpec>(STAGES.map((stage) => [stage.slug, stage]));

export function stageForSlug(slug: string): StageSpec | undefined {
  return BY_SLUG.get(slug);
}

/** The slug that should follow `slug` in a full relay; `phase-summary` at a phase end. */
export function nextSlugAfter(slug: string): string | undefined {
  const stage = BY_SLUG.get(slug);
  if (!stage) return undefined;
  const following = STAGES[stage.ordinal]; // ordinal is 1-based, so this is the next entry
  if (!following || following.phase !== stage.phase) return PHASE_SUMMARY_SLUG;
  return following.slug;
}
