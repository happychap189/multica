/**
 * Phase metadata for a full relay: which squad owns each phase and who leads it.
 *
 * Squad names are the exact `name` values used by the relay seed (they contain
 * CJK characters and must be matched verbatim — see
 * `docs/my-best-practice/templates/aidlc-relay-roster.json`). Leaders are the
 * `leader` agent names from the same roster.
 */

export type PhaseNumber = 1 | 2 | 3 | 4 | 5;

export interface PhaseSpec {
  readonly phase: PhaseNumber;
  /** Exact squad `name` — matched verbatim against the live squads API. */
  readonly squadName: string;
  /** Exact leader agent `name`. */
  readonly leader: string;
}

// prettier-ignore
export const PHASES: readonly PhaseSpec[] = Object.freeze([
  { phase: 1, squadName: "aidlc-阶段一-启动", leader: "aidlc-architect" },
  { phase: 2, squadName: "aidlc-阶段二-构思", leader: "aidlc-product" },
  { phase: 3, squadName: "aidlc-阶段三-孵化", leader: "aidlc-architect" },
  { phase: 4, squadName: "aidlc-阶段四-构建", leader: "aidlc-architect" },
  { phase: 5, squadName: "aidlc-阶段五-运营", leader: "aidlc-operations" },
]);

const BY_NUMBER = new Map<number, PhaseSpec>(PHASES.map((p) => [p.phase, p]));

export function phaseSpec(phase: number): PhaseSpec | undefined {
  return BY_NUMBER.get(phase);
}

/** The phases a full relay walks, in order. */
export function isPhaseNumber(value: number): value is PhaseNumber {
  return value >= 1 && value <= 5 && Number.isInteger(value);
}
