import {
  InvalidEvaluationSpecError,
  buildResult,
  emptyFeedback,
  outcomeFor,
  round2,
  type Evaluator,
  type EvaluationResult
} from "./types";

/**
 * Numeric answers: a VAT amount, a margin, a balance.
 *
 * Tolerance is explicit rather than implied. A relative tolerance alone cannot
 * express "to the nearest cent" when the expected value is zero, and an absolute
 * one alone cannot express "within 0.5%" across magnitudes, so a spec may declare
 * either or both and the answer passes if it satisfies whichever are set.
 */

export interface NumericSpec {
  expected: number;
  /** Fraction, not percent: 0.01 means 1%. */
  tolerancePct?: number;
  toleranceAbs?: number;
  /** Shown in feedback. Never parsed from the learner's input. */
  unit?: string;
  label?: string;
  points?: number;
  /** Awarded when the sign is right but the magnitude is not, if set. */
  partialCreditForSign?: boolean;
}

export interface NumericSubmission {
  value: number;
}

const DEFAULT_TOLERANCE_PCT = 0.0001;

/**
 * Floating-point arithmetic must not turn an answer exactly at the authored
 * boundary into a failure (`100.01 - 100` is not exactly `0.01` in IEEE-754).
 * This scales an epsilon to the magnitudes being compared without widening a
 * learner-facing tolerance in any material way.
 */
export function isAtMost(actual: number, limit: number, sourceMagnitude = 1): boolean {
  const epsilon =
    Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(limit), Math.abs(sourceMagnitude)) * 8;
  return actual <= limit || Math.abs(actual - limit) <= epsilon;
}

export function isWithinTolerance(actual: number, spec: NumericSpec): boolean {
  if (!Number.isFinite(actual)) {
    return false;
  }

  const diff = Math.abs(actual - spec.expected);

  if (
    typeof spec.toleranceAbs === "number" &&
    isAtMost(diff, spec.toleranceAbs, Math.max(Math.abs(actual), Math.abs(spec.expected)))
  ) {
    return true;
  }

  const pct = spec.tolerancePct ?? (typeof spec.toleranceAbs === "number" ? undefined : DEFAULT_TOLERANCE_PCT);

  if (typeof pct !== "number") {
    return false;
  }

  // Guard the zero-expected case: a relative tolerance around 0 is always 0, so
  // fall back to comparing against 1 unit rather than demanding exactness by
  // accident.
  const base = Math.max(Math.abs(spec.expected), 1);

  return isAtMost(diff / base, pct);
}

/**
 * Parses a learner-entered number tolerantly but unambiguously.
 *
 * French input uses a comma decimal separator and space thousands separators;
 * both are accepted. A string containing anything else numeric-looking is
 * rejected rather than coerced, because silently reading "12,5 %" as 12.5 when
 * the expected unit is euros would be a false positive.
 */
export function parseNumericAnswer(input: string): number | null {
  const cleaned = input
    .replace(/\u00A0/g, " ")
    .replace(/\s/g, "")
    .replace(/€|EUR/gi, "")
    .replace(",", ".");

  if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const value = Number(cleaned);

  return Number.isFinite(value) ? value : null;
}

export const numericEvaluator: Evaluator<NumericSpec, NumericSubmission> = {
  type: "numeric",
  version: "numeric@1",

  assertValidSpec(spec) {
    if (!Number.isFinite(spec.expected)) {
      throw new InvalidEvaluationSpecError("numeric: `expected` must be a finite number.");
    }

    if (typeof spec.tolerancePct === "number" && (!Number.isFinite(spec.tolerancePct) || spec.tolerancePct < 0)) {
      throw new InvalidEvaluationSpecError("numeric: `tolerancePct` must be a finite non-negative number.");
    }

    if (typeof spec.toleranceAbs === "number" && (!Number.isFinite(spec.toleranceAbs) || spec.toleranceAbs < 0)) {
      throw new InvalidEvaluationSpecError("numeric: `toleranceAbs` must be a finite non-negative number.");
    }

    if (typeof spec.points === "number" && (!Number.isFinite(spec.points) || spec.points <= 0)) {
      throw new InvalidEvaluationSpecError("numeric: `points` must be a finite number greater than zero.");
    }
  },

  evaluate(spec, submission): EvaluationResult {
    numericEvaluator.assertValidSpec(spec);

    const points = spec.points ?? 1;
    const label = spec.label ?? "Résultat numérique";
    const feedback = emptyFeedback();
    const unit = spec.unit ? ` ${spec.unit}` : "";
    const expectedText = `${round2(spec.expected)}${unit}`;

    if (!Number.isFinite(submission.value)) {
      feedback.calculationErrors.push(`Aucune valeur numérique exploitable. Attendu : ${expectedText}.`);
      feedback.missing.push(label);

      return buildResult({
        evaluationType: "numeric",
        evaluatorVersion: numericEvaluator.version,
        criteria: [
          {
            id: "value",
            label,
            maxPoints: points,
            awardedPoints: 0,
            outcome: "missed",
            justification: `Attendu : ${expectedText}.`
          }
        ],
        feedback
      });
    }

    const given = `${round2(submission.value)}${unit}`;

    if (isWithinTolerance(submission.value, spec)) {
      feedback.correct.push(`${label} : ${given}.`);

      return buildResult({
        evaluationType: "numeric",
        evaluatorVersion: numericEvaluator.version,
        criteria: [
          {
            id: "value",
            label,
            maxPoints: points,
            awardedPoints: points,
            outcome: "met",
            justification: `Valeur dans la tolérance (attendu ${expectedText}).`
          }
        ],
        feedback
      });
    }

    // A sign error is a different mistake from a magnitude error — reversing a
    // debit and a credit is an accounting treatment problem, not arithmetic.
    const signMatches = Math.sign(submission.value) === Math.sign(spec.expected);
    const awarded = spec.partialCreditForSign && signMatches ? round2(points / 2) : 0;

    if (!signMatches && spec.expected !== 0) {
      feedback.accountingTreatmentErrors.push(
        `${label} : le sens est inversé (${given} au lieu de ${expectedText}).`
      );
    } else {
      feedback.calculationErrors.push(`${label} : ${given} au lieu de ${expectedText}.`);
    }

    if (awarded > 0) {
      feedback.partial.push(`${label} : bon ordre de grandeur, montant inexact.`);
    } else {
      feedback.missing.push(label);
    }

    return buildResult({
      evaluationType: "numeric",
      evaluatorVersion: numericEvaluator.version,
      criteria: [
        {
          id: "value",
          label,
          maxPoints: points,
          awardedPoints: awarded,
          outcome: outcomeFor(awarded, points),
          justification: `Attendu ${expectedText}, obtenu ${given}.`
        }
      ],
      feedback
    });
  }
};
