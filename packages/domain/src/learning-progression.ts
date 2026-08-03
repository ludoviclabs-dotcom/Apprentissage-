import { comptaCaseStudies, isCaseStudyExercise } from "./compta-generale-cloture";
import { COMPTA_GENERALE_V1_TRACK, comptaGeneraleV1MiniCase } from "./compta-generale-v1";
import { EXCEL_LAB_TRACK } from "./excel-lab";
import type { ActivityKind, MasteryEventKind } from "./mastery";

export type LearningMode = "demo" | "new" | "enrolled";
export type MasteryEvidenceContext = "exercise" | "case_study";
export type MasteryEvidenceSource = "graded_attempt" | "review" | "case_study" | "diagnostic";

export interface CanonicalTrackDefinition {
  trackId: string;
  moduleId: string;
  title: string;
  description: string;
  href: string;
  demoExerciseId: string;
  sourceLabel: string;
  premium: boolean;
  /** One corrected exercise per published level closes the diagnostic gate. */
  diagnosticExerciseIds: Readonly<Record<string, string>>;
}

/**
 * The only tracks exposed as personal progression.
 *
 * The historical `track-compta-generale` remains in the versioned catalogue so
 * its events and enrollments are preserved, but it has no registration here and
 * therefore cannot become a second dashboard progression engine.
 */
export const canonicalLearningTracks: readonly CanonicalTrackDefinition[] = [
  {
    trackId: COMPTA_GENERALE_V1_TRACK,
    moduleId: "module-compta-generale-v1",
    title: "Comptabilité générale — parcours v1",
    description: "Factures, règlements, TVA, banque, immobilisations et clôture.",
    href: "/modules/comptabilite-generale",
    demoExerciseId: "ex-cgv1-achat-marchandises",
    sourceLabel: "Curriculum Comptabilité générale v1",
    premium: false,
    diagnosticExerciseIds: {
      "level-compta-generale-v1-1": "ex-cgv1-tva-deductible-qcm",
      "level-compta-generale-v1-2": "ex-cgv1-tva-a-decaisser",
      // PR-12a : la synthèse de chaque nouveau niveau — le total de la balance
      // après inventaire (N3) et le total du bilan (N4) — clôt le diagnostic.
      "level-compta-generale-v1-3": "ex-cgv1-balance-apres-inventaire",
      "level-compta-generale-v1-4": "ex-cgv1-total-bilan"
    }
  },
  {
    trackId: EXCEL_LAB_TRACK,
    moduleId: "module-excel-finance-lab",
    title: "Excel Finance Lab",
    description: "Formules, soldes de gestion, trésorerie et écarts budgétaires.",
    href: "/modules/excel-finance-lab",
    demoExerciseId: "ex-xl-chiffre-affaires",
    sourceLabel: "Curriculum Excel Finance Lab",
    premium: true,
    diagnosticExerciseIds: {
      "level-excel-finance-1": "ex-xl-taux-marge",
      "level-excel-finance-2": "ex-xl-budget-ecart"
    }
  }
] as const;

export function getCanonicalTrackDefinition(trackId: string): CanonicalTrackDefinition | null {
  return canonicalLearningTracks.find((track) => track.trackId === trackId) ?? null;
}

export function getCanonicalTrackForExercise(
  exerciseId: string
): CanonicalTrackDefinition | null {
  if (exerciseId.startsWith("ex-cgv1-")) {
    return getCanonicalTrackDefinition(COMPTA_GENERALE_V1_TRACK);
  }

  if (exerciseId.startsWith("ex-xl-")) {
    return getCanonicalTrackDefinition(EXCEL_LAB_TRACK);
  }

  return null;
}

/**
 * Server-verified evidence families for one corrected attempt.
 *
 * A caller may identify the context, but cannot choose a score or an arbitrary
 * kind. The exercise registry decides which level and whether it is the
 * curriculum's diagnostic. Formula/journal grading checks the method as well as
 * the result, so the same corrected attempt legitimately supplies explanation
 * evidence without trusting prose sent by the browser.
 */
export function getAttemptEvidenceKinds(input: {
  exerciseId: string;
  levelId: string;
  context: MasteryEvidenceContext;
}): MasteryEventKind[] {
  const track = getCanonicalTrackForExercise(input.exerciseId);

  if (!track) {
    return [];
  }

  // Membership is checked against every authored case — the N2 mini-case and
  // the PR-12a closing / annual cases — so a caller cannot claim case-study
  // evidence for an exercise no case contains.
  const belongsToCase =
    comptaGeneraleV1MiniCase.steps.some((step) => step.exerciseId === input.exerciseId) ||
    isCaseStudyExercise(input.exerciseId);
  const context = input.context === "case_study" && belongsToCase ? "case_study" : "exercise";

  const kinds: MasteryEventKind[] = [
    context === "case_study" ? "caseStudy" : "direct",
    "explanation"
  ];
  const diagnosticExerciseId = track.diagnosticExerciseIds[input.levelId];
  const isMiniCaseClosing =
    context === "case_study" &&
    (comptaGeneraleV1MiniCase.steps.at(-1)?.exerciseId === input.exerciseId ||
      comptaCaseStudies.some((caseStudy) => caseStudy.steps.at(-1)?.exerciseId === input.exerciseId));

  if (diagnosticExerciseId === input.exerciseId || isMiniCaseClosing) {
    if (!kinds.includes("caseStudy")) {
      kinds.push("caseStudy");
    }

    kinds.push("finalDiagnostic");
  }

  return kinds;
}

export const reviewScoreByRating = {
  forgotten: 0,
  partial: 50,
  correct: 75,
  mastered: 100
} as const satisfies Record<string, number>;

export function isWeightedKind(kind: MasteryEventKind): kind is ActivityKind {
  return kind !== "finalDiagnostic";
}
