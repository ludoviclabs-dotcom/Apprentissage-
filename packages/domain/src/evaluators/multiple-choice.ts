import {
  InvalidEvaluationSpecError,
  buildResult,
  emptyFeedback,
  outcomeFor,
  type Evaluator,
  type EvaluationResult
} from "./types";

/**
 * Single- and multi-answer multiple choice.
 *
 * Multi-answer scoring is the part worth being explicit about. Awarding one point
 * per correct box ticked rewards ticking every box, so a wrong selection has to
 * cost something. The penalty is measured against the number of *incorrect*
 * options rather than the correct ones:
 *
 *     ratio = hits / |correct| − falsePositives / |incorrect|, floored at zero
 *
 * which makes "tick everything" score exactly zero for any question, whatever the
 * mix — the honest outcome for a learner who has not discriminated. Scoring it
 * against |correct| instead would leave a residue whenever the distractors are
 * fewer than the answers.
 */

export interface MultipleChoiceOption {
  id: string;
  label: string;
  /** Shown once the answer is submitted, whether or not it was selected. */
  rationale?: string;
}

export interface MultipleChoiceSpec {
  options: MultipleChoiceOption[];
  correctOptionIds: string[];
  points?: number;
  label?: string;
  /** When false, a multi-answer question is all-or-nothing. Defaults to true. */
  allowPartialCredit?: boolean;
}

export interface MultipleChoiceSubmission {
  selectedOptionIds: string[];
}

export const multipleChoiceEvaluator: Evaluator<MultipleChoiceSpec, MultipleChoiceSubmission> = {
  type: "multiple_choice",
  version: "multiple_choice@1",

  assertValidSpec(spec) {
    if (spec.options.length < 2) {
      throw new InvalidEvaluationSpecError("multiple_choice: at least two options are required.");
    }

    const ids = new Set<string>();

    for (const option of spec.options) {
      if (!option.id.trim()) {
        throw new InvalidEvaluationSpecError("multiple_choice: an option id cannot be empty.");
      }

      if (ids.has(option.id)) {
        throw new InvalidEvaluationSpecError(`multiple_choice: duplicate option id "${option.id}".`);
      }

      ids.add(option.id);
    }

    if (spec.correctOptionIds.length === 0) {
      throw new InvalidEvaluationSpecError("multiple_choice: at least one correct option is required.");
    }

    if (spec.correctOptionIds.length === spec.options.length) {
      // Every option correct means the question discriminates nothing.
      throw new InvalidEvaluationSpecError("multiple_choice: not every option can be correct.");
    }

    for (const id of spec.correctOptionIds) {
      if (!ids.has(id)) {
        throw new InvalidEvaluationSpecError(`multiple_choice: correct option "${id}" is not among the options.`);
      }
    }

    if (typeof spec.points === "number" && spec.points <= 0) {
      throw new InvalidEvaluationSpecError("multiple_choice: `points` must be greater than zero.");
    }
  },

  evaluate(spec, submission): EvaluationResult {
    multipleChoiceEvaluator.assertValidSpec(spec);

    const points = spec.points ?? 1;
    const label = spec.label ?? "Choix";
    const known = new Set(spec.options.map((option) => option.id));
    const correct = new Set(spec.correctOptionIds);

    // De-duplicate and drop unknown ids rather than crediting or penalising them:
    // an id the spec does not define says nothing about the learner.
    const selected = new Set(submission.selectedOptionIds.filter((id) => known.has(id)));

    const hits = [...selected].filter((id) => correct.has(id));
    const falsePositives = [...selected].filter((id) => !correct.has(id));
    const missed = [...correct].filter((id) => !selected.has(id));

    const allowPartial = spec.allowPartialCredit ?? true;
    const incorrectCount = spec.options.length - correct.size;
    const ratio = Math.max(
      0,
      hits.length / correct.size - falsePositives.length / Math.max(1, incorrectCount)
    );
    const exact = missed.length === 0 && falsePositives.length === 0;
    // Left unrounded on purpose: the score is derived from the sum of awarded
    // points, so rounding here would round twice and drift.
    const awarded = exact ? points : allowPartial ? points * ratio : 0;

    const feedback = emptyFeedback();
    const labelOf = (id: string) => spec.options.find((option) => option.id === id)?.label ?? id;

    for (const id of hits) {
      feedback.correct.push(`${labelOf(id)}`);
    }

    for (const id of falsePositives) {
      const option = spec.options.find((item) => item.id === id);
      feedback.reasoningErrors.push(
        option?.rationale ? `${option.label} — ${option.rationale}` : `Proposition retenue à tort : ${labelOf(id)}.`
      );
    }

    for (const id of missed) {
      feedback.missing.push(`Proposition attendue non retenue : ${labelOf(id)}.`);
    }

    if (awarded > 0 && awarded < points) {
      feedback.partial.push(`${label} : ${hits.length}/${correct.size} bonnes propositions.`);
    }

    return buildResult({
      evaluationType: "multiple_choice",
      evaluatorVersion: multipleChoiceEvaluator.version,
      criteria: [
        {
          id: "selection",
          label,
          maxPoints: points,
          awardedPoints: awarded,
          outcome: outcomeFor(awarded, points),
          justification: exact
            ? "Sélection exacte."
            : `${hits.length} bonne(s) sur ${correct.size}, ${falsePositives.length} de trop.`
        }
      ],
      feedback
    });
  }
};
