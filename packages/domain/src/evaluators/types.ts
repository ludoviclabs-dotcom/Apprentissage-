/**
 * Typed, deterministic evaluation.
 *
 * The previous grader had one strategy for every exercise: normalise the answer,
 * then look for words taken from the rubric *label* — because `RubricItem` is
 * `{ label, points }` and carries no machine-checkable expectation. Quoting the
 * criterion back scored full marks; a correct answer phrased differently scored
 * zero.
 *
 * Each evaluator here declares what it needs, so a specification is data an author
 * writes rather than prose a matcher guesses at. Every evaluator is a pure
 * function: no clock, no randomness, no I/O. Identifiers and timestamps are
 * stamped by the submission service, never by the evaluator, so the same answer
 * always yields the same result and a stored result can be recomputed.
 */

export const EVALUATION_TYPES = [
  "multiple_choice",
  "numeric",
  "journal_entry",
  "short_text_rubric",
  "spreadsheet",
  "spreadsheet_formula",
  "legacy_rubric"
] as const;

export type EvaluationType = (typeof EVALUATION_TYPES)[number];

/** Marks are out of 20 throughout this codebase; evaluators keep that scale. */
export const MAX_SCORE = 20;

export type CriterionOutcome = "met" | "partial" | "missed";

export interface CriterionResult {
  id: string;
  label: string;
  maxPoints: number;
  awardedPoints: number;
  outcome: CriterionOutcome;
  /** Why the points were awarded or withheld. Shown to the learner verbatim. */
  justification: string;
}

/**
 * Errors split by kind, as `AGENTS.md` requires: "Corrections must separate
 * calculation errors, accounting treatment errors and reasoning errors."
 */
export interface StructuredFeedback {
  correct: string[];
  partial: string[];
  missing: string[];
  calculationErrors: string[];
  accountingTreatmentErrors: string[];
  reasoningErrors: string[];
  sourceQualityIssues: string[];
}

export interface EvaluationResult {
  evaluationType: EvaluationType;
  /** Which evaluator produced this, so a stored result stays interpretable. */
  evaluatorVersion: string;
  /** 0–20, rounded to two decimals. */
  score: number;
  maxScore: number;
  criteria: CriterionResult[];
  feedback: StructuredFeedback;
}

/** Raised when a specification cannot produce a meaningful evaluation. */
export class InvalidEvaluationSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidEvaluationSpecError";
  }
}

/** Raised when a learner's submission does not match the evaluator's input shape. */
export class InvalidSubmissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSubmissionError";
  }
}

export interface Evaluator<Spec, Submission> {
  type: EvaluationType;
  version: string;
  /** Validates the authored specification. Called at seed time and by tests. */
  assertValidSpec(spec: Spec): void;
  evaluate(spec: Spec, submission: Submission): EvaluationResult;
}

// --- Shared helpers --------------------------------------------------------

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function emptyFeedback(): StructuredFeedback {
  return {
    correct: [],
    partial: [],
    missing: [],
    calculationErrors: [],
    accountingTreatmentErrors: [],
    reasoningErrors: [],
    sourceQualityIssues: []
  };
}

export function outcomeFor(awardedPoints: number, maxPoints: number): CriterionOutcome {
  if (maxPoints <= 0 || awardedPoints <= 0) {
    return "missed";
  }

  return awardedPoints >= maxPoints ? "met" : "partial";
}

/**
 * Rescales the criteria total onto the 0–20 marking scale.
 *
 * Authors weight criteria in whatever units read naturally; the learner always
 * sees a mark out of 20. A specification whose criteria total zero is a spec
 * error, not a zero score — it would silently mark every submission as perfect
 * or as failed depending on the rounding, so it is rejected when validated.
 */
export function scaleToMark(awarded: number, totalPoints: number): number {
  if (totalPoints <= 0) {
    return 0;
  }

  return round2(Math.max(0, Math.min(MAX_SCORE, (awarded / totalPoints) * MAX_SCORE)));
}

export function buildResult(input: {
  evaluationType: EvaluationType;
  evaluatorVersion: string;
  criteria: CriterionResult[];
  feedback: StructuredFeedback;
}): EvaluationResult {
  const totalPoints = input.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);
  const awarded = input.criteria.reduce((sum, criterion) => sum + criterion.awardedPoints, 0);

  return {
    evaluationType: input.evaluationType,
    evaluatorVersion: input.evaluatorVersion,
    score: scaleToMark(awarded, totalPoints),
    maxScore: MAX_SCORE,
    criteria: input.criteria,
    feedback: input.feedback
  };
}
