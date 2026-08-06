import type { StructuredFeedback } from "@finance/domain";

/**
 * Ce que le serveur renvoie après correction, vu du navigateur.
 *
 * Les mêmes formes que `GradedActivity` côté domaine, restreintes à ce qui
 * traverse la frontière HTTP. Elles sont déclarées ici plutôt qu'importées de
 * `@finance/content-publication` parce qu'un composant client ne doit pas
 * pouvoir atteindre `gradeCalculation` : ce serait le chemin par lequel la
 * réponse attendue finirait dans le bundle.
 */

export interface CorrectionPayload {
  explanation: string;
  steps: Array<{
    order: number;
    description: string;
    expression?: string;
    intermediateResult?: number;
  }>;
  expectedLines?: Array<{
    accountNumber: string;
    accountLabel: string;
    debit: number;
    credit: number;
    lineExplanation: string;
  }>;
  expectedAnswer?: { value: number; unit: string };
  expectedErrorCategory?: string;
  expectedCorrection?: string;
}

export interface CriterionPayload {
  id: string;
  label: string;
  maxPoints: number;
  awardedPoints: number;
  outcome: "met" | "partial" | "missed";
  justification: string;
}

export interface GradeResponse {
  score: number;
  maxScore: number;
  passed: boolean;
  feedback: StructuredFeedback;
  criteria: CriterionPayload[];
  correction: CorrectionPayload;
}

export interface CalculationGradeResponse extends GradeResponse {
  errorKind: "non-numerique" | "arrondi" | "signe" | "hors-tolerance" | "aucune";
  hint: string | null;
}

export interface DiagnosisGradeResponse extends GradeResponse {
  justificationGraded: false;
}

export interface CaseStepGradeResponse extends GradeResponse {
  stepId: string;
  /** Faux pour une étape en réponse libre : elle est corrigée, jamais notée. */
  gradable: boolean;
}
