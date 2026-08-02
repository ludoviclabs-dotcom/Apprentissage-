import { randomUUID } from "node:crypto";
import {
  MAX_SCORE,
  getModuleLevelForExercise,
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
import { recordMasteryEvent } from "./mastery-repository";
import { enqueueAttemptReview, type AttemptReviewResult } from "./review-repository";
import { withUserContext } from "./user-context";

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
  | { kind: "journal"; lines: Array<{ account: string; debit?: number; credit?: number }> }
  | {
      kind: "spreadsheet";
      cells: Record<string, { value?: number; formula?: string }>;
    };

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
  /** Whether the mark moved a module level's progression (PR-02). */
  progress?: AttemptProgressResult;
}

export interface AttemptProgressResult {
  attributed: boolean;
  /** The level the exercise belongs to, even when the event was not recorded. */
  levelId: string | null;
  /** Why nothing was attributed. Null when it was. */
  reason: string | null;
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

    case "spreadsheet": {
      if (payload.kind !== "spreadsheet") {
        throw new UnsupportedSubmissionError(evaluationType, payload.kind);
      }

      return getEvaluator("spreadsheet").evaluate(spec as never, { cells: payload.cells });
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
    case "spreadsheet":
      // Sorted so the stored text is stable for one submission whatever order
      // the client happened to serialise the cells in.
      return Object.entries(payload.cells)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([cell, entry]) => `${cell}=${entry.value ?? ""}${entry.formula ? ` (${entry.formula})` : ""}`)
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
  // No `canUseDatabase()` guard: `getActiveExerciseVersion` resolves the authored
  // catalogue when there is no database, so a specification grades the same way
  // in the public demo as in a database-backed install. Guarding here is what
  // made the typed engine unreachable everywhere except a seeded PostgreSQL.
  const version = await getActiveExerciseVersion(exercise.id);

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

  // Grading and retention are one act, not two. Routing this through the single
  // submission path is what stops a caller from recording a mark and forgetting
  // to schedule the retest — the failure mode that made "revision" a static list
  // before PR-04.
  //
  // ONE TRANSACTION, for the same reason. Recording the attempt and scheduling
  // its retest ran in two, which left a window: the attempt committed, the
  // scheduling failed, the endpoint returned 500, and the learner — told their
  // work was not saved — resubmitted and produced a second attempt row for the
  // same answer. Either both land or neither does.
  const userAnswer = renderSubmission(input.payload);
  const evaluation = {
    evaluationType: graded.evaluationType,
    exerciseVersionId: graded.exerciseVersionId
  };
  const reviewInput = {
    userId: input.userId,
    exercise,
    score: graded.correction.score,
    microLesson: graded.correction.remediationPlan.microLesson,
    nextAction: graded.correction.remediationPlan.nextAction
  };

  // Seeded mode has no transaction to share: `recordAttempt` is a no-op and the
  // schedule comes back marked `persisted: false`.
  let review: AttemptReviewResult;

  if (!canUseDatabase() || !input.userId) {
    await recordAttempt(input.userId, exercise.id, userAnswer, graded.correction, evaluation);
    review = await enqueueAttemptReview(reviewInput);
  } else {
    let persisted: AttemptReviewResult | undefined;

    await withUserContext(input.userId, async (tx) => {
      await recordAttempt(input.userId, exercise.id, userAnswer, graded.correction, evaluation, {
        tx
      });
      persisted = await enqueueAttemptReview({ ...reviewInput, tx });
    });

    review = persisted as AttemptReviewResult;
  }

  // Outside the branch, so a seeded submission reports which level it *would*
  // have fed rather than reporting nothing at all — the early return used to
  // skip this entirely, and the module page then had no progress to show.
  return {
    ...graded,
    review,
    progress: await recordModuleProgress(input.userId, exercise.id, graded.correction.score)
  };
}

/**
 * Feeds a graded module exercise into the PR-02 mastery model.
 *
 * Answering a question is the most common thing a learner does, and until now it
 * moved no progression bar: mastery events only existed behind an API nothing in
 * the product called. An exercise that belongs to a module level now records a
 * `direct` event against it, so the level score is a consequence of the work
 * rather than something to be entered separately.
 *
 * NOT IN THE TRANSACTION ABOVE, and it does not fail the submission. A missing
 * level means the database predates this module's curriculum — real for anyone
 * who migrated without re-seeding — and refusing a correctly graded answer over
 * an analytics row would be the wrong trade. The outcome is reported rather than
 * swallowed: `attributed: false` with a reason travels back to the caller, so
 * "progression did not move" is visible instead of mysterious. Because the
 * request still succeeds, there is no retry, and therefore no duplicate event.
 */
async function recordModuleProgress(
  userId: string,
  exerciseId: string,
  score: number
): Promise<AttemptProgressResult> {
  const levelId = getModuleLevelForExercise(exerciseId);

  if (!levelId) {
    return { attributed: false, levelId: null, reason: "exercise-not-in-a-module" };
  }

  if (!canUseDatabase() || !userId) {
    return { attributed: false, levelId, reason: "not-persisted" };
  }

  try {
    // The marking scale is 0–20 and mastery is a percentage; converting here
    // keeps the scale conversion in one place.
    await recordMasteryEvent(userId, {
      levelId,
      kind: "direct",
      scorePercent: Math.max(0, Math.min(100, (score / MAX_SCORE) * 100)),
      sourceRef: exerciseId
    });

    return { attributed: true, levelId, reason: null };
  } catch (error) {
    return {
      attributed: false,
      levelId,
      reason: error instanceof Error ? error.message : "unknown-error"
    };
  }
}
