import type { Correction, RemediationPlan, RubricScore, SourceReference } from "../types";
import type { EvaluationResult } from "./types";

/**
 * Adapts an {@link EvaluationResult} to the `Correction` the rest of the app
 * already consumes.
 *
 * `Correction` has sixteen required fields and every one of them has a reader —
 * the correction panel, the error journal, competency strength, the revision
 * scheduler. Rather than change that contract in the same PR that changes how
 * grading works, the new engine fills it exactly.
 *
 * Two details are load-bearing:
 *
 * - `rubricScores` is keyed by `criterion` in the UI, so criterion labels must be
 *   unique within one correction. Duplicates are suffixed rather than silently
 *   collapsed into one row.
 * - `errors` is the *legacy* pane: the panel renders it only when every
 *   structured category is empty. Filling both would show the same mistake twice,
 *   so it is populated only as a fallback.
 */

export interface CorrectionIdentity {
  /** Stamped by the caller. Evaluators never read a clock. */
  id: string;
  exerciseId: string;
  sourceReferences: SourceReference[];
  remediationPlan: RemediationPlan;
}

function uniqueLabels(result: EvaluationResult): RubricScore[] {
  const seen = new Map<string, number>();

  return result.criteria.map((criterion) => {
    const count = seen.get(criterion.label) ?? 0;
    seen.set(criterion.label, count + 1);

    return {
      criterion: count === 0 ? criterion.label : `${criterion.label} (${count + 1})`,
      maxPoints: criterion.maxPoints,
      // Rounded here, at the display boundary. Evaluators keep full precision so
      // the score is not the result of rounding twice.
      awardedPoints: Math.round(criterion.awardedPoints * 100) / 100,
      justification: criterion.justification
    };
  });
}

export function summaryForScore(score: number): string {
  if (score >= 16) {
    return "Réponse solide : le barème est largement couvert et les points de preuve sont exploitables.";
  }

  if (score >= 10) {
    return "Réponse partielle : la logique principale existe, mais la justification doit être mieux structurée.";
  }

  return "Réponse fragile : reprendre les critères du barème avant de conclure.";
}

export function toCorrection(result: EvaluationResult, identity: CorrectionIdentity): Correction {
  const structured = [
    ...result.feedback.calculationErrors,
    ...result.feedback.accountingTreatmentErrors,
    ...result.feedback.reasoningErrors,
    ...result.feedback.sourceQualityIssues
  ];

  return {
    id: identity.id,
    exerciseId: identity.exerciseId,
    score: result.score,
    summary: summaryForScore(result.score),
    rubricScores: uniqueLabels(result),
    correct:
      result.feedback.correct.length > 0
        ? result.feedback.correct
        : ["Le sujet est abordé, mais aucun critère n'est complètement acquis."],
    partialPoints: result.feedback.partial,
    // Kept in step with the structured categories so the legacy pane stays dark
    // whenever the typed one has something to show.
    errors: structured,
    calculationErrors: result.feedback.calculationErrors,
    accountingTreatmentErrors: result.feedback.accountingTreatmentErrors,
    reasoningErrors: result.feedback.reasoningErrors,
    sourceQualityIssues: result.feedback.sourceQualityIssues,
    missingElements: [...new Set(result.feedback.missing)],
    remediation: identity.remediationPlan.nextAction,
    remediationPlan: identity.remediationPlan,
    sourceReferences: identity.sourceReferences
  };
}
