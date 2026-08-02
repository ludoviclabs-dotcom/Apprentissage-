import { randomUUID } from "node:crypto";
import {
  getEvaluator,
  isSpecEvaluationType,
  toCorrection,
  type Correction,
  type EvaluationResult,
  type Exercise,
  type RemediationPlan,
  type SourceReference
} from "@finance/domain";
import { canUseDatabase } from "./client";
import { getActiveExerciseVersion, type ResolvedExerciseVersion } from "./exercise-repository";
import { getExerciseById, gradeExercise, recordAttempt } from "./repository";
import { enqueueAttemptReview, type AttemptReviewResult } from "./review-repository";

/**
 * The single place an answer becomes a correction.
 *
 * Selection is by *authored version*, not by `exercise.type`. The seeded data
 * makes that necessary: `ex-provision-reprise` is typed `journal-entry` but its
 * expected answer is prose with no accounts, and the two `qcm` exercises have no
 * options field anywhere — their choices live in the statement text. Keying the
 * engine off `type` would hand those to an evaluator that cannot grade them.
 *
 * An exercise with no active version keeps the previous grader, behind
 * `legacy_rubric`. That is the migration path: content moves over one exercise at
 * a time, and until it does the learner sees exactly what they saw before.
 */

export type SubmissionPayload =
  | { kind: "text"; text: string }
  | { kind: "numeric"; value: number }
  | { kind: "choice"; selectedOptionIds: string[] }
  | { kind: "journal"; lines: Array<{ account: string; debit?: number; credit?: number }> };

export class UnsupportedSubmissionError extends Error {
  constructor(evaluationType: string, kind: string) {
    super(`Un évaluateur "${evaluationType}" ne peut pas traiter une soumission de type "${kind}".`);
    this.name = "UnsupportedSubmissionError";
  }
}

export interface GradedSubmission {
  correction: Correction;
  /** Which engine produced it, so the caller can record and display it. */
  evaluationType: string;
  exerciseVersionId: string | null;
  /**
   * What the mark did to the learner's review schedule (PR-04). Present on a
   * persisted submission, absent from {@link gradeSubmission}, which grades
   * without touching state.
   */
  review?: AttemptReviewResult;
}

/**
 * Maps the learner's payload onto the shape the chosen evaluator expects.
 *
 * A mismatch throws rather than being coerced: silently reading a text answer as
 * a numeric zero would score a thoughtful answer as a wrong calculation, which is
 * precisely the class of false negative this PR exists to remove.
 */
function evaluateWith(
  version: ResolvedExerciseVersion,
  payload: SubmissionPayload
): EvaluationResult {
  const { evaluationType, spec } = version;

  if (!isSpecEvaluationType(evaluationType)) {
    throw new UnsupportedSubmissionError(evaluationType, payload.kind);
  }

  switch (evaluationType) {
    case "numeric": {
      if (payload.kind !== "numeric") {
        throw new UnsupportedSubmissionError(evaluationType, payload.kind);
      }

      return getEvaluator("numeric").evaluate(spec as never, { value: payload.value });
    }

    case "multiple_choice": {
      if (payload.kind !== "choice") {
        throw new UnsupportedSubmissionError(evaluationType, payload.kind);
      }

      return getEvaluator("multiple_choice").evaluate(spec as never, {
        selectedOptionIds: payload.selectedOptionIds
      });
    }

    case "journal_entry": {
      if (payload.kind !== "journal") {
        throw new UnsupportedSubmissionError(evaluationType, payload.kind);
      }

      return getEvaluator("journal_entry").evaluate(spec as never, { lines: payload.lines });
    }

    case "short_text_rubric": {
      if (payload.kind !== "text") {
        throw new UnsupportedSubmissionError(evaluationType, payload.kind);
      }

      return getEvaluator("short_text_rubric").evaluate(spec as never, { text: payload.text });
    }
  }
}

/** Plain-text rendering of a payload, for the `attempts.user_answer` column. */
export function renderSubmission(payload: SubmissionPayload): string {
  switch (payload.kind) {
    case "text":
      return payload.text;
    case "numeric":
      return String(payload.value);
    case "choice":
      return payload.selectedOptionIds.join(", ");
    case "journal":
      return payload.lines
        .map((line) => `${line.account} D${line.debit ?? 0} C${line.credit ?? 0}`)
        .join(" | ");
  }
}

/**
 * Grades a submission without persisting it. Exported so the golden test-case
 * runner and the API can share exactly one code path.
 */
export async function gradeSubmission(
  exercise: Exercise,
  payload: SubmissionPayload,
  identity: { id: string; sourceReferences: SourceReference[]; remediationPlan: RemediationPlan }
): Promise<GradedSubmission> {
  const version = canUseDatabase() ? await getActiveExerciseVersion(exercise.id) : null;

  if (!version) {
    // No authored version: fall back to the previous grader untouched.
    return {
      correction: gradeExercise(exercise, renderSubmission(payload)),
      evaluationType: "legacy_rubric",
      exerciseVersionId: null
    };
  }

  const result = evaluateWith(version, payload);

  return {
    correction: toCorrection(result, {
      id: identity.id,
      exerciseId: exercise.id,
      sourceReferences: identity.sourceReferences,
      remediationPlan: identity.remediationPlan
    }),
    evaluationType: version.evaluationType,
    exerciseVersionId: version.id
  };
}

/**
 * Grades and persists. The correction id is stamped here, never inside an
 * evaluator, so evaluation stays a pure function of its inputs.
 */
export async function submitAttempt(input: {
  userId: string;
  exerciseId: string;
  payload: SubmissionPayload;
}): Promise<GradedSubmission | null> {
  const exercise = await getExerciseById(input.exerciseId);

  if (!exercise) {
    return null;
  }

  // The legacy grader supplies its own sources and remediation; for the new
  // engine we reuse the same helpers so the correction panel is unchanged.
  const reference = gradeExercise(exercise, renderSubmission(input.payload));

  const graded = await gradeSubmission(exercise, input.payload, {
    id: `corr-${randomUUID()}`,
    sourceReferences: reference.sourceReferences,
    remediationPlan: reference.remediationPlan
  });

  await recordAttempt(input.userId, exercise.id, renderSubmission(input.payload), graded.correction, {
    evaluationType: graded.evaluationType,
    exerciseVersionId: graded.exerciseVersionId
  });

  // Grading and retention are one act, not two. Routing this through the single
  // submission path is what stops a caller from recording a mark and forgetting
  // to schedule the retest — the failure mode that made "revision" a static list
  // before PR-04.
  const review = await enqueueAttemptReview({
    userId: input.userId,
    exercise,
    score: graded.correction.score,
    microLesson: graded.correction.remediationPlan.microLesson,
    nextAction: graded.correction.remediationPlan.nextAction
  });

  return { ...graded, review };
}
