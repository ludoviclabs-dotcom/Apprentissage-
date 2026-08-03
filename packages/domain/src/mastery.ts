import type { CompetencyStatus } from "./types";

/**
 * Deterministic mastery scoring and level unlocking.
 *
 * Everything here is a pure function of its inputs. No dates are read, no
 * randomness, no I/O: the same events and the same rules always produce the same
 * snapshot, which is what makes snapshots safe to recompute and unlock decisions
 * safe to re-evaluate.
 *
 * Rules are *data*, not constants. They arrive as a {@link MasteryRules} value
 * loaded from a curriculum version, so thresholds and weights can change without
 * a code change and, more importantly, without retroactively re-grading learners
 * who progressed under the previous version.
 */

/** The four activity families a level score is composed from. */
export const ACTIVITY_KINDS = ["direct", "retention", "caseStudy", "explanation"] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** `finalDiagnostic` is a gate, not a weighted component. */
export type MasteryEventKind = ActivityKind | "finalDiagnostic";

export type ScoreWeights = Record<ActivityKind, number>;

export interface MasteryRules {
  /** Identifies the curriculum version these rules came from. */
  version: string;
  weights: ScoreWeights;
  /** Minimum weighted level score, as a percentage. */
  passingScore: number;
  /** Minimum strength for every competency flagged critical on the level. */
  criticalCompetencyMinimum: number;
  requireFinalDiagnostic: boolean;
}

export interface MasteryEvent {
  levelId: string;
  kind: MasteryEventKind;
  /** 0–100. Use {@link toPercent} to convert a mark out of 20. */
  scorePercent: number;
  /** ISO 8601. Used only for ordering, never for "now". */
  occurredAt: string;
  /** Nullable only for rows created before ADR 008. */
  sourceRef?: string | null;
  sourceEventId?: string | null;
  exerciseVersionId?: string | null;
  sourceType?: string | null;
  correctedAt?: string | null;
}

export interface CriticalCompetencyStrength {
  competencyId: string;
  strength: number;
}

/** Why a level is not passed. Shown to the learner verbatim. */
export type UnlockBlockerCode =
  | "previous-level-not-acquired"
  | "score-below-threshold"
  | "critical-competency-too-weak"
  | "final-diagnostic-missing";

export interface UnlockBlocker {
  code: UnlockBlockerCode;
  detail: string;
}

/** Canonical vocabulary shared by persistence, APIs and pages. */
export type LevelStatus = "locked" | "available" | "in_progress" | "passed" | "planned";

export interface LevelSnapshot {
  levelId: string;
  rulesVersion: string;
  status: LevelStatus;
  /** Weighted score, 0–100, rounded to two decimals. */
  score: number;
  /** Per-kind contribution actually used, after the latest-wins reduction. */
  components: Record<ActivityKind, number>;
  /** Kinds with no event yet — they contribute zero. */
  missingKinds: ActivityKind[];
  finalDiagnosticCompleted: boolean;
  blockers: UnlockBlocker[];
}

export class InvalidMasteryRulesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMasteryRulesError";
  }
}

/** Weights are floats; allow a cent of drift when summing them. */
const WEIGHT_SUM_TOLERANCE = 0.001;

export function assertValidRules(rules: MasteryRules): void {
  for (const kind of ACTIVITY_KINDS) {
    const weight = rules.weights[kind];

    if (typeof weight !== "number" || Number.isNaN(weight)) {
      throw new InvalidMasteryRulesError(`Weight for "${kind}" is missing or not a number.`);
    }

    if (weight < 0) {
      throw new InvalidMasteryRulesError(`Weight for "${kind}" cannot be negative.`);
    }
  }

  const sum = ACTIVITY_KINDS.reduce((total, kind) => total + rules.weights[kind], 0);

  if (Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    // Normalising silently would mean a typo quietly rescales everyone's scores.
    throw new InvalidMasteryRulesError(`Weights must sum to 1, got ${sum}.`);
  }

  for (const [name, value] of [
    ["passingScore", rules.passingScore],
    ["criticalCompetencyMinimum", rules.criticalCompetencyMinimum]
  ] as const) {
    if (typeof value !== "number" || Number.isNaN(value) || value < 0 || value > 100) {
      throw new InvalidMasteryRulesError(`${name} must be a percentage between 0 and 100.`);
    }
  }
}

/** Converts a mark out of `max` (graders in this codebase use 20) to a percentage. */
export function toPercent(score: number, max = 20): number {
  if (max <= 0) {
    throw new RangeError("max must be greater than zero.");
  }

  return clampPercent((score / max) * 100);
}

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

/** Two decimals, so a score is comparable and displayable without drift. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeLevelScore(components: Record<ActivityKind, number>, rules: MasteryRules): number {
  assertValidRules(rules);

  const total = ACTIVITY_KINDS.reduce(
    (sum, kind) => sum + clampPercent(components[kind] ?? 0) * rules.weights[kind],
    0
  );

  return round2(total);
}

/**
 * Reduces a learner's events for one level into the components used for scoring.
 *
 * **Latest wins.** Mastery should describe current ability, so a newer result
 * replaces an older one for the same activity kind rather than being averaged or
 * maxed. A missing kind counts as zero, which is why {@link LevelSnapshot} lists
 * `missingKinds`: a level scoring 40 because nothing was attempted must not look
 * like a level scoring 40 because everything went badly.
 *
 * Ties on `occurredAt` are broken by input order, so the reduction is total and
 * stable for a given event list.
 */
export function reduceEventsToComponents(events: MasteryEvent[]): {
  components: Record<ActivityKind, number>;
  missingKinds: ActivityKind[];
  finalDiagnosticCompleted: boolean;
} {
  const latest = new Map<MasteryEventKind, MasteryEvent>();

  for (const event of events) {
    const current = latest.get(event.kind);

    if (!current || event.occurredAt >= current.occurredAt) {
      latest.set(event.kind, event);
    }
  }

  const components = {} as Record<ActivityKind, number>;
  const missingKinds: ActivityKind[] = [];

  for (const kind of ACTIVITY_KINDS) {
    const event = latest.get(kind);

    if (event) {
      components[kind] = clampPercent(event.scorePercent);
    } else {
      components[kind] = 0;
      missingKinds.push(kind);
    }
  }

  return {
    components,
    missingKinds,
    finalDiagnosticCompleted: latest.has("finalDiagnostic")
  };
}

export interface EvaluateLevelInput {
  levelId: string;
  events: MasteryEvent[];
  criticalCompetencies: CriticalCompetencyStrength[];
  /** False for the first level of a track. */
  previousLevelAcquired: boolean;
  /**
   * Whether an unlock event already exists for this level. Acquisition is
   * monotonic: once cleared, a later dip in scores does not re-lock the level.
   */
  alreadyAcquired: boolean;
}

export function evaluateLevel(input: EvaluateLevelInput, rules: MasteryRules): LevelSnapshot {
  assertValidRules(rules);

  const scoped = input.events.filter((event) => event.levelId === input.levelId);
  const { components, missingKinds, finalDiagnosticCompleted } = reduceEventsToComponents(scoped);
  const score = computeLevelScore(components, rules);
  const blockers: UnlockBlocker[] = [];

  if (!input.previousLevelAcquired) {
    blockers.push({
      code: "previous-level-not-acquired",
      detail: "Le niveau précédent n'est pas encore acquis."
    });
  }

  if (score < rules.passingScore) {
    blockers.push({
      code: "score-below-threshold",
      detail: `Score ${score} / ${rules.passingScore} requis.`
    });
  }

  // Critical competencies are checked independently of the global score: a level
  // must not be cleared by compensating a weak essential with strong optionals.
  const weakest = [...input.criticalCompetencies].sort((left, right) => left.strength - right.strength)[0];

  if (weakest && weakest.strength < rules.criticalCompetencyMinimum) {
    blockers.push({
      code: "critical-competency-too-weak",
      detail: `Compétence critique ${weakest.competencyId} à ${weakest.strength}, minimum ${rules.criticalCompetencyMinimum}.`
    });
  }

  if (rules.requireFinalDiagnostic && !finalDiagnosticCompleted) {
    blockers.push({
      code: "final-diagnostic-missing",
      detail: "Le diagnostic final du niveau n'est pas terminé."
    });
  }

  return {
    levelId: input.levelId,
    rulesVersion: rules.version,
    status: resolveStatus({
      alreadyAcquired: input.alreadyAcquired,
      previousLevelAcquired: input.previousLevelAcquired,
      hasBlockers: blockers.length > 0,
      hasActivity: scoped.length > 0
    }),
    score,
    components,
    missingKinds,
    finalDiagnosticCompleted,
    blockers
  };
}

function resolveStatus(input: {
  alreadyAcquired: boolean;
  previousLevelAcquired: boolean;
  hasBlockers: boolean;
  hasActivity: boolean;
}): LevelStatus {
  if (input.alreadyAcquired) {
    return "passed";
  }

  if (!input.previousLevelAcquired) {
    return "locked";
  }

  if (!input.hasBlockers) {
    return "passed";
  }

  return input.hasActivity ? "in_progress" : "available";
}

/**
 * Whether clearing this level should be recorded. Separate from the status so the
 * caller decides when to write, and so the decision is testable on its own.
 */
export function shouldRecordUnlock(snapshot: LevelSnapshot, alreadyAcquired: boolean): boolean {
  return !alreadyAcquired && snapshot.blockers.length === 0;
}

/**
 * Evaluates an ordered track. Each level's availability depends on the previous
 * level's acquisition, so this is the only place that ordering is interpreted.
 */
export function evaluateTrack(
  levels: Array<{
    levelId: string;
    criticalCompetencies: CriticalCompetencyStrength[];
  }>,
  input: { events: MasteryEvent[]; acquiredLevelIds: Iterable<string> },
  rules: MasteryRules
): LevelSnapshot[] {
  const acquired = new Set(input.acquiredLevelIds);
  const snapshots: LevelSnapshot[] = [];
  let previousAcquired = true; // The first level of a track has no prerequisite.

  for (const level of levels) {
    const snapshot = evaluateLevel(
      {
        levelId: level.levelId,
        events: input.events,
        criticalCompetencies: level.criticalCompetencies,
        previousLevelAcquired: previousAcquired,
        alreadyAcquired: acquired.has(level.levelId)
      },
      rules
    );

    snapshots.push(snapshot);
    previousAcquired = snapshot.status === "passed";
  }

  return snapshots;
}

const STATUS_LABELS: Record<LevelStatus, string> = {
  locked: "verrouillé",
  available: "disponible",
  in_progress: "en cours",
  passed: "acquis",
  planned: "planifié"
};

export function getLevelStatusLabel(status: LevelStatus): string {
  return STATUS_LABELS[status];
}

/** Maps a level score onto the existing competency vocabulary for display reuse. */
export function competencyStatusFromScore(score: number, rules: MasteryRules): CompetencyStatus {
  if (score >= rules.passingScore) {
    return "mastered";
  }

  if (score >= rules.criticalCompetencyMinimum) {
    return "in-progress";
  }

  return score > 0 ? "fragile" : "not-started";
}
