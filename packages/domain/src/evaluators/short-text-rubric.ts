import { normalizeForMatching } from "../text";
import {
  InvalidEvaluationSpecError,
  buildResult,
  emptyFeedback,
  outcomeFor,
  round2,
  type CriterionResult,
  type Evaluator,
  type EvaluationResult,
  type StructuredFeedback
} from "./types";

/**
 * Short written justifications, scored against authored criteria.
 *
 * The difference from the grader this replaces is where the expectation comes
 * from. That one matched words lifted from the criterion's own label, so quoting
 * the label scored full marks and a correct answer in different words scored
 * nothing. Here every criterion declares its accepted formulations explicitly,
 * and may declare disqualifying ones.
 *
 * This is still keyword matching — it cannot judge an argument. What it can do is
 * be honest about that: `errorKind` classifies each miss so the feedback says
 * which sort of mistake it is, and a criterion nobody can satisfy is rejected as
 * a specification error rather than silently failing every learner.
 */

export type CriterionErrorKind = "calculation" | "accounting-treatment" | "reasoning" | "source-quality";

export interface TextCriterion {
  id: string;
  label: string;
  points: number;
  /** Satisfied when any of these appears. Accent- and case-insensitive. */
  anyOf: string[];
  /** Every one of these must also appear. Use for compulsory qualifiers. */
  allOf?: string[];
  /** Presence of any of these forfeits the criterion, even if `anyOf` matched. */
  mustNotContain?: string[];
  /** Which bucket a miss belongs in. Defaults to reasoning. */
  errorKind?: CriterionErrorKind;
  /** Shown when the criterion is missed. */
  hint?: string;
}

export interface ShortTextRubricSpec {
  criteria: TextCriterion[];
  /** Below this many characters the answer is treated as not attempted. */
  minLength?: number;
}

export interface ShortTextSubmission {
  text: string;
}

const DEFAULT_MIN_LENGTH = 12;

function pushError(feedback: StructuredFeedback, kind: CriterionErrorKind, message: string): void {
  const bucket: Record<CriterionErrorKind, string[]> = {
    calculation: feedback.calculationErrors,
    "accounting-treatment": feedback.accountingTreatmentErrors,
    reasoning: feedback.reasoningErrors,
    "source-quality": feedback.sourceQualityIssues
  };

  bucket[kind].push(message);
}

function contains(haystack: string, needle: string): boolean {
  return haystack.includes(normalizeForMatching(needle));
}

export const shortTextRubricEvaluator: Evaluator<ShortTextRubricSpec, ShortTextSubmission> = {
  type: "short_text_rubric",
  version: "short_text_rubric@1",

  assertValidSpec(spec) {
    if (spec.criteria.length === 0) {
      throw new InvalidEvaluationSpecError("short_text_rubric: at least one criterion is required.");
    }

    const ids = new Set<string>();

    for (const criterion of spec.criteria) {
      if (ids.has(criterion.id)) {
        throw new InvalidEvaluationSpecError(`short_text_rubric: duplicate criterion id "${criterion.id}".`);
      }

      ids.add(criterion.id);

      if (criterion.points <= 0) {
        throw new InvalidEvaluationSpecError(
          `short_text_rubric: criterion "${criterion.id}" must be worth more than zero.`
        );
      }

      if (criterion.anyOf.length === 0) {
        // Without an accepted formulation the criterion can never be met, which
        // would cap every learner below the maximum for no stated reason.
        throw new InvalidEvaluationSpecError(
          `short_text_rubric: criterion "${criterion.id}" declares no accepted formulation.`
        );
      }

      for (const term of [...criterion.anyOf, ...(criterion.allOf ?? [])]) {
        if (!term.trim()) {
          throw new InvalidEvaluationSpecError(
            `short_text_rubric: criterion "${criterion.id}" has an empty expected term.`
          );
        }
      }

      const forbidden = (criterion.mustNotContain ?? []).map(normalizeForMatching);
      const accepted = criterion.anyOf.map(normalizeForMatching);

      // A term that both satisfies and disqualifies the criterion is a
      // contradiction the author cannot have meant.
      const contradiction = accepted.find((term) => forbidden.includes(term));

      if (contradiction) {
        throw new InvalidEvaluationSpecError(
          `short_text_rubric: criterion "${criterion.id}" both accepts and forbids "${contradiction}".`
        );
      }
    }
  },

  evaluate(spec, submission): EvaluationResult {
    shortTextRubricEvaluator.assertValidSpec(spec);

    const normalized = normalizeForMatching(submission.text);
    const minLength = spec.minLength ?? DEFAULT_MIN_LENGTH;
    const feedback = emptyFeedback();
    const attempted = normalized.length >= minLength;

    if (!attempted) {
      feedback.missing.push("Réponse trop courte pour être évaluée.");
    }

    const criteria: CriterionResult[] = spec.criteria.map((criterion) => {
      const kind = criterion.errorKind ?? "reasoning";

      if (!attempted) {
        return {
          id: criterion.id,
          label: criterion.label,
          maxPoints: criterion.points,
          awardedPoints: 0,
          outcome: "missed" as const,
          justification: "Non traité."
        };
      }

      const forbidden = (criterion.mustNotContain ?? []).find((term) => contains(normalized, term));

      if (forbidden) {
        pushError(feedback, kind, `${criterion.label} : formulation à éviter (« ${forbidden} »).`);

        return {
          id: criterion.id,
          label: criterion.label,
          maxPoints: criterion.points,
          awardedPoints: 0,
          outcome: "missed" as const,
          justification: `Contient « ${forbidden} », qui disqualifie le critère.`
        };
      }

      const matched = criterion.anyOf.some((term) => contains(normalized, term));
      const missingRequired = (criterion.allOf ?? []).filter((term) => !contains(normalized, term));

      if (matched && missingRequired.length === 0) {
        feedback.correct.push(criterion.label);

        return {
          id: criterion.id,
          label: criterion.label,
          maxPoints: criterion.points,
          awardedPoints: criterion.points,
          outcome: "met" as const,
          justification: "Critère traité."
        };
      }

      // Half credit when the idea is there but a compulsory qualifier is not:
      // "il faut provisionner" without "obligation actuelle" is closer than
      // silence, and saying so is more useful than a bare zero.
      const awarded = matched ? round2(criterion.points / 2) : 0;

      if (matched) {
        feedback.partial.push(`${criterion.label} : il manque ${missingRequired.join(", ")}.`);
      } else {
        feedback.missing.push(criterion.label);
        pushError(feedback, kind, criterion.hint ?? `${criterion.label} : non traité.`);
      }

      return {
        id: criterion.id,
        label: criterion.label,
        maxPoints: criterion.points,
        awardedPoints: awarded,
        outcome: outcomeFor(awarded, criterion.points),
        justification: matched
          ? `Élément attendu manquant : ${missingRequired.join(", ")}.`
          : (criterion.hint ?? "Aucune formulation attendue trouvée.")
      };
    });

    return buildResult({
      evaluationType: "short_text_rubric",
      evaluatorVersion: shortTextRubricEvaluator.version,
      criteria,
      feedback
    });
  }
};
