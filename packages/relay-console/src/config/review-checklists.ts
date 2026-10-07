import type { PhaseNumber } from "./phases";
import { PHASE_STAGE_COUNTS, STAGES } from "./stages";

/**
 * The five phase review checklists (relay-protocol §4).
 *
 * Every checklist has the same four segments, in the same order. What differs
 * per phase is which stages were reviewed and by whom.
 *
 * A deliberate scope note: this module models the checklist's *structure* and
 * its mechanically-derivable parts — which stages the phase covers, which of
 * them carry a reviewer and in which mode, and the handoff-hygiene arithmetic.
 * The detailed artifact filenames live in `relay-protocol.md` §4, which stays
 * the authority; they are not copied here. Duplicating ~120 artifact names by
 * hand would introduce a second source of truth that silently drifts from the
 * pack, and long CJK payloads are exactly what has corrupted in transit before.
 * The TUI renders each segment with a pointer to §4 alongside the tickable
 * stage items.
 *
 * Reviewer assignments are extracted from the `stage 顺序表` tables in
 * `docs/my-best-practice/templates/aidlc-relay-pack/squad-instructions/phase-*.md`
 * (columns `#`, `slug`, `reviewer`) and cross-checked against §4: phases 1 and 5
 * have none; phase 2 has two advisory; phase 3 has six advisory; phase 4 has
 * four adversarial.
 */

export type ReviewMode = "advisory" | "adversarial";

export interface ReviewerAssignment {
  readonly ordinal: number;
  readonly slug: string;
  readonly reviewer: string;
  readonly mode: ReviewMode;
}

// prettier-ignore
export const REVIEWER_ASSIGNMENTS: readonly ReviewerAssignment[] = Object.freeze([
  { ordinal: 4,  slug: "intent-capture",       reviewer: "aidlc-product-lead",          mode: "advisory" },
  { ordinal: 7,  slug: "rough-mockups",        reviewer: "aidlc-product-lead",          mode: "advisory" },
  { ordinal: 11, slug: "requirements-analysis", reviewer: "aidlc-product-lead",         mode: "advisory" },
  { ordinal: 12, slug: "user-stories",         reviewer: "aidlc-product-lead",          mode: "advisory" },
  { ordinal: 13, slug: "domain-design",        reviewer: "aidlc-architecture-reviewer", mode: "advisory" },
  { ordinal: 16, slug: "refined-mockups",      reviewer: "aidlc-product-lead",          mode: "advisory" },
  { ordinal: 17, slug: "units-generation",     reviewer: "aidlc-architecture-reviewer", mode: "advisory" },
  { ordinal: 18, slug: "contract-design",      reviewer: "aidlc-architecture-reviewer", mode: "advisory" },
  { ordinal: 20, slug: "functional-design",    reviewer: "aidlc-architecture-reviewer", mode: "adversarial" },
  { ordinal: 21, slug: "nfr-requirements",     reviewer: "aidlc-architecture-reviewer", mode: "adversarial" },
  { ordinal: 22, slug: "nfr-design",           reviewer: "aidlc-architecture-reviewer", mode: "adversarial" },
  { ordinal: 23, slug: "infrastructure-design", reviewer: "aidlc-architecture-reviewer", mode: "adversarial" },
]);

export type ChecklistSegmentId = "artifacts" | "verdicts" | "revisions" | "hygiene";

export interface ChecklistItem {
  /** Stable across renders; the operator's tick is keyed on it. */
  readonly id: string;
  readonly label: string;
  /** Stage slug this item is about, when it is about exactly one. */
  readonly stage?: string;
}

export interface ChecklistSegment {
  readonly id: ChecklistSegmentId;
  readonly title: string;
  readonly items: readonly ChecklistItem[];
}

export interface PhaseChecklist {
  readonly phase: PhaseNumber;
  readonly title: string;
  readonly segments: readonly ChecklistSegment[];
}

const SEGMENT_TITLES: Readonly<Record<ChecklistSegmentId, string>> = Object.freeze({
  artifacts: "核心制品核对",
  verdicts: "reviewer verdict 摘要核对",
  revisions: "附件修订号引用核对",
  hygiene: "交接卫生项",
});

export function reviewersForPhase(phase: PhaseNumber): readonly ReviewerAssignment[] {
  return REVIEWER_ASSIGNMENTS.filter((assignment) => {
    const stage = STAGES[assignment.ordinal - 1];
    return stage?.phase === phase;
  });
}

export function checklistFor(phase: PhaseNumber): PhaseChecklist {
  const stages = STAGES.filter((stage) => stage.phase === phase);
  const reviewers = reviewersForPhase(phase);
  const stageCount = PHASE_STAGE_COUNTS[phase];

  const artifacts: ChecklistItem[] = stages.map((stage) => ({
    id: `artifacts:${stage.slug}`,
    label: `#${stage.ordinal} ${stage.slug}`,
    stage: stage.slug,
  }));

  const verdicts: ChecklistItem[] =
    reviewers.length === 0
      ? [
          {
            id: "verdicts:none",
            label: "this phase has no reviewer stage — its summary must say so",
          },
        ]
      : reviewers.map((assignment) => ({
          id: `verdicts:${assignment.slug}`,
          label: `#${assignment.ordinal} ${assignment.slug} — ${assignment.reviewer} (${assignment.mode})`,
          stage: assignment.slug,
        }));

  const revisions: ChecklistItem[] = [
    {
      id: "revisions:present",
      label: "every artifact attachment carries a revision marker (first issue is r1)",
    },
    {
      id: "revisions:verdict-refs",
      label: "each reviewer verdict cites the attachment id and revision it read",
    },
    {
      id: "revisions:rework",
      label: "reworked artifacts have an increased revision that matches the verdict",
    },
  ];

  const hygiene: ChecklistItem[] = [
    {
      id: "hygiene:no-residual-tasks",
      label: "no queued / running / pending task remains for this squad",
    },
    {
      id: "hygiene:anchor-count",
      label: `progress anchors for this phase equal ${stageCount} (plus one per rework)`,
    },
    ...(phase === 5
      ? [
          {
            id: "hygiene:two-stage",
            label: "the issue has entered the terminal two-stage close (§3.10)",
          },
        ]
      : []),
  ];

  return {
    phase,
    title: `P${phase} checklist`,
    segments: [
      { id: "artifacts", title: SEGMENT_TITLES.artifacts, items: artifacts },
      { id: "verdicts", title: SEGMENT_TITLES.verdicts, items: verdicts },
      { id: "revisions", title: SEGMENT_TITLES.revisions, items: revisions },
      { id: "hygiene", title: SEGMENT_TITLES.hygiene, items: hygiene },
    ],
  };
}

export function allChecklists(): readonly PhaseChecklist[] {
  return ([1, 2, 3, 4, 5] as const).map(checklistFor);
}
