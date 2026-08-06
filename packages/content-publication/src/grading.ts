import type { DiagnosisErrorCategory, RoundingRule } from "@finance/content-generation";
import { applyRounding } from "@finance/content-generation";
import {
  journalEntryEvaluator,
  numericEvaluator,
  parseNumericAnswer,
  type EvaluationResult,
  type JournalEntrySpec,
  type JournalLineSpec
} from "@finance/domain";
import type { PublishedContentVersion } from "./types";

/**
 * Notation des activités publiées.
 *
 * ELLE NE CRÉE AUCUN MOTEUR. `numericEvaluator` et `journalEntryEvaluator`
 * existent depuis PR-03 et notent déjà le catalogue *authored* ; ce module se
 * borne à traduire un instantané publié en la spécification qu'ils attendent.
 * Un second moteur, même « juste pour les contenus générés », voudrait dire deux
 * définitions de « l'écriture est juste » et donc, tôt ou tard, deux réponses.
 *
 * AUCUN APPEL DE MODÈLE. Rien ici n'interroge une IA, y compris pour la
 * justification libre d'un diagnostic : elle est enregistrée telle quelle et
 * jamais notée, ce que le schéma d'origine annonce déjà.
 */

/** Ce qu'une correction rapporte en plus du résultat brut des évaluateurs. */
export interface GradedActivity {
  result: EvaluationResult;
  /** Vrai quand la note atteint la barre de réussite de l'activité. */
  passed: boolean;
  /** Ce que l'apprenant doit voir *après* sa tentative, jamais avant. */
  correction: ActivityCorrection;
}

export interface ActivityCorrection {
  explanation: string;
  /** Étapes de correction, quand le contenu en publie. */
  steps: Array<{ order: number; description: string; expression?: string; intermediateResult?: number }>;
  /** L'écriture attendue, pour un exercice de journal. */
  expectedLines?: Array<{
    accountNumber: string;
    accountLabel: string;
    debit: number;
    credit: number;
    lineExplanation: string;
  }>;
  expectedAnswer?: { value: number; unit: string };
  expectedErrorCategory?: DiagnosisErrorCategory;
  expectedCorrection?: string;
}

/** Une note sur 20 au-dessus de cette barre vaut réussite. */
export const ACTIVITY_PASS_SCORE = 12;

function passed(result: EvaluationResult): boolean {
  return result.score >= ACTIVITY_PASS_SCORE;
}

// --- Exercice de calcul ----------------------------------------------------

export type CalculationSubmission = { raw: string } | { value: number };

/**
 * Nature d'une erreur numérique, au-delà de « faux ».
 *
 * Le cahier des charges demande de distinguer l'arrondi, l'unité, le signe et le
 * hors-tolérance : ce sont quatre remédiations différentes, et les confondre
 * renverrait l'apprenant réviser la mauvaise chose.
 */
export type CalculationErrorKind =
  | "non-numerique"
  | "arrondi"
  | "signe"
  | "hors-tolerance"
  | "aucune";

export interface GradedCalculation extends GradedActivity {
  errorKind: CalculationErrorKind;
  /** Message ciblé sur l'erreur constatée, en plus du retour de l'évaluateur. */
  hint: string | null;
}

/**
 * Diagnostique une réponse numérique fausse.
 *
 * L'ordre des tests n'est pas indifférent : une réponse juste *avant* arrondi est
 * une erreur d'arrondi et pas une erreur de calcul, et le dire est la seule chose
 * utile à en dire. Le signe passe ensuite, le hors-tolérance en dernier — c'est
 * le cas générique.
 */
function diagnoseCalculation(
  value: number,
  expected: number,
  tolerance: number,
  rounding: RoundingRule
): { kind: CalculationErrorKind; hint: string | null } {
  if (!Number.isFinite(value)) {
    return {
      kind: "non-numerique",
      hint: "Saisir un nombre : les séparateurs de milliers et la virgule décimale sont acceptés, les unités ne le sont pas."
    };
  }

  if (Math.abs(value - expected) <= tolerance) {
    return { kind: "aucune", hint: null };
  }

  // Bonne méthode, arrondi non appliqué : la valeur brute de l'apprenant tombe
  // sur la réponse une fois la règle d'arrondi de l'énoncé appliquée.
  if (rounding !== "none" && Math.abs(applyRounding(value, rounding) - expected) <= tolerance) {
    return {
      kind: "arrondi",
      hint: `Le calcul est bon, l'arrondi ne l'est pas : la règle demandée est « ${roundingLabel(rounding)} ».`
    };
  }

  if (expected !== 0 && Math.sign(value) === -Math.sign(expected) && Math.abs(Math.abs(value) - Math.abs(expected)) <= tolerance) {
    return {
      kind: "signe",
      hint: "La valeur absolue est juste, le signe est inversé : vérifier le sens de l'opération."
    };
  }

  return {
    kind: "hors-tolerance",
    hint: "Le résultat est hors tolérance : reprendre les données de l'énoncé une à une avant de recalculer."
  };
}

export function roundingLabel(rule: RoundingRule): string {
  const labels: Record<RoundingRule, string> = {
    none: "aucun arrondi",
    cent: "au centime",
    unit: "à l'unité",
    "two-decimals": "à deux décimales"
  };

  return labels[rule];
}

export function gradeCalculation(
  version: PublishedContentVersion,
  submission: CalculationSubmission
): GradedCalculation {
  if (version.contentSnapshot.contentType !== "calculation_exercise") {
    throw new Error(`« ${version.id} » n'est pas un exercice de calcul`);
  }

  const exercise = version.contentSnapshot.content;
  const parsed =
    "value" in submission ? submission.value : (parseNumericAnswer(submission.raw) ?? Number.NaN);

  const result = numericEvaluator.evaluate(
    {
      expected: exercise.expectedAnswer,
      toleranceAbs: exercise.tolerance,
      unit: exercise.unit,
      label: exercise.title,
      points: exercise.gradingRubric.reduce((sum, item) => sum + item.points, 0) || 1,
      partialCreditForSign: true
    },
    { value: parsed }
  );

  const diagnosis = diagnoseCalculation(
    parsed,
    exercise.expectedAnswer,
    exercise.tolerance,
    exercise.roundingRule
  );

  return {
    result,
    passed: passed(result),
    errorKind: diagnosis.kind,
    hint: diagnosis.hint,
    correction: {
      explanation: exercise.explanation,
      steps: [...exercise.calculationSteps].sort((left, right) => left.order - right.order),
      expectedAnswer: { value: exercise.expectedAnswer, unit: exercise.unit }
    }
  };
}

// --- Écriture comptable ----------------------------------------------------

export interface JournalSubmissionLine {
  account: string;
  debit?: number;
  credit?: number;
}

/**
 * Traduit une écriture publiée en spécification d'évaluateur.
 *
 * `allowedAlternativeAccounts` devient `alsoAccept` sur *chaque* ligne : le
 * schéma de la fabrique déclare les variantes au niveau de l'écriture, alors que
 * l'évaluateur les attend au niveau de la ligne. Les répartir plutôt que de
 * choisir une ligne au hasard préserve le sens — « ce plan de comptes emploie
 * 6161 là où le nôtre emploie 616 » vaut partout où le compte apparaît.
 */
export function toJournalEntrySpec(version: PublishedContentVersion): JournalEntrySpec {
  if (version.contentSnapshot.contentType !== "journal_entry_exercise") {
    throw new Error(`« ${version.id} » n'est pas une écriture comptable`);
  }

  const exercise = version.contentSnapshot.content;
  const alternatives = exercise.allowedAlternativeAccounts;

  const expectedLines: JournalLineSpec[] = exercise.expectedLines.map((line) => ({
    account: line.accountNumber,
    debit: line.debit > 0 ? line.debit : undefined,
    credit: line.credit > 0 ? line.credit : undefined,
    label: line.accountLabel,
    alsoAccept: alternatives.filter((account) => account !== line.accountNumber)
  }));

  return {
    expectedLines,
    amountToleranceAbs: 0.01,
    // Une ligne en trop est une erreur : c'est le double comptage que le
    // chapitre enseigne justement à éviter.
    allowExtraLines: false
  };
}

export function gradeJournalEntry(
  version: PublishedContentVersion,
  lines: readonly JournalSubmissionLine[]
): GradedActivity {
  if (version.contentSnapshot.contentType !== "journal_entry_exercise") {
    throw new Error(`« ${version.id} » n'est pas une écriture comptable`);
  }

  const exercise = version.contentSnapshot.content;
  const result = journalEntryEvaluator.evaluate(toJournalEntrySpec(version), {
    lines: lines.map((line) => ({
      account: line.account,
      debit: line.debit,
      credit: line.credit
    }))
  });

  // UNE ÉCRITURE DÉSÉQUILIBRÉE N'EST PAS RÉUSSIE, QUELLE QUE SOIT LA NOTE.
  // L'équilibre ne pèse que deux points sur treize dans le barème de
  // l'évaluateur : bons comptes, bon sens et un seul montant faux suffisaient à
  // franchir la barre des 12/20 avec un journal qui ne s'équilibre pas — ce que
  // le chapitre enseigne précisément à ne jamais laisser passer. La note reste
  // celle de l'évaluateur ; c'est la réussite qui exige l'équilibre en plus.
  const balance = result.criteria.find((criterion) => criterion.id === "balance");

  return {
    result,
    passed: passed(result) && balance?.outcome === "met",
    correction: {
      explanation: exercise.explanation,
      steps: [],
      expectedLines: exercise.expectedLines.map((line) => ({
        accountNumber: line.accountNumber,
        accountLabel: line.accountLabel,
        debit: line.debit,
        credit: line.credit,
        lineExplanation: line.lineExplanation
      }))
    }
  };
}

/** Somme des débits et des crédits d'une proposition, pour l'affichage en direct. */
export function totalsOf(lines: readonly JournalSubmissionLine[]): {
  debit: number;
  credit: number;
  balanced: boolean;
} {
  const round = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
  const debit = round(lines.reduce((sum, line) => sum + (line.debit ?? 0), 0));
  const credit = round(lines.reduce((sum, line) => sum + (line.credit ?? 0), 0));

  return { debit, credit, balanced: debit === credit && debit > 0 };
}

// --- Diagnostic d'erreur ---------------------------------------------------

export interface DiagnosisSubmission {
  category: DiagnosisErrorCategory;
  /** Enregistrée, jamais notée. Le schéma d'origine le dit explicitement. */
  justification?: string;
}

/**
 * Noté sur la seule catégorie : c'est déterministe, et c'est tout ce que ce lot
 * prétend savoir évaluer. La justification libre exigerait une notation par
 * modèle, que le cahier des charges exclut.
 */
export function gradeErrorDiagnosis(
  version: PublishedContentVersion,
  submission: DiagnosisSubmission
): GradedActivity {
  if (version.contentSnapshot.contentType !== "error_diagnosis_exercise") {
    throw new Error(`« ${version.id} » n'est pas un diagnostic d'erreur`);
  }

  const exercise = version.contentSnapshot.content;
  const correct = submission.category === exercise.expectedErrorCategory;
  const points = exercise.gradingRubric.reduce((sum, item) => sum + item.points, 0) || 1;

  const result: EvaluationResult = {
    evaluationType: "multiple_choice",
    evaluatorVersion: "published-diagnosis@1",
    score: correct ? 20 : 0,
    maxScore: 20,
    criteria: [
      {
        id: "category",
        label: "Nature de l'erreur",
        maxPoints: points,
        awardedPoints: correct ? points : 0,
        outcome: correct ? "met" : "missed",
        justification: correct
          ? "Catégorie exacte."
          : `Catégorie attendue : ${errorCategoryLabels[exercise.expectedErrorCategory]}.`
      }
    ],
    feedback: {
      correct: correct ? ["Nature de l'erreur correctement identifiée."] : [],
      partial: [],
      missing: correct ? [] : ["Nature de l'erreur"],
      calculationErrors: [],
      accountingTreatmentErrors: correct
        ? []
        : [`L'erreur était de nature « ${errorCategoryLabels[exercise.expectedErrorCategory]} ».`],
      reasoningErrors: [],
      sourceQualityIssues: []
    }
  };

  return {
    result,
    passed: correct,
    correction: {
      explanation: exercise.explanation,
      steps: [],
      expectedErrorCategory: exercise.expectedErrorCategory,
      expectedCorrection: exercise.expectedCorrection
    }
  };
}

/** Aucun identifiant brut à l'écran : la règle de `status-labels.ts`, ici aussi. */
export const errorCategoryLabels: Record<DiagnosisErrorCategory, string> = {
  wrong_account: "Mauvais compte",
  wrong_debit_credit_direction: "Mauvais sens débit/crédit",
  wrong_amount: "Mauvais montant",
  wrong_formula: "Mauvaise formule",
  missing_line: "Ligne manquante",
  wrong_date: "Mauvaise date",
  wrong_valuation_basis: "Mauvaise base de valorisation",
  double_counting: "Double comptabilisation",
  no_error: "Aucune erreur"
};

// --- Étape de mini-cas -----------------------------------------------------

export type CaseStepSubmission =
  | { kind: "calculation"; raw: string }
  | { kind: "journal_entry"; lines: readonly JournalSubmissionLine[] }
  | { kind: "error_diagnosis"; category: DiagnosisErrorCategory; justification?: string }
  | { kind: "short_answer"; text: string };

export interface GradedCaseStep extends GradedActivity {
  stepId: string;
}

/**
 * Note une étape de cas contre sa propre spécification.
 *
 * L'étape `short_answer` est le seul type que ce lot ne note pas : ses
 * `expectedPoints` sont de la prose, et les comparer à la prose de l'apprenant
 * demanderait la notation libre que le cahier des charges exclut. Elle est donc
 * rendue « déposée, corrigée à la lecture » — la correction s'affiche, la note
 * n'existe pas — plutôt que notée au jugé.
 */
export function gradeCaseStep(
  version: PublishedContentVersion,
  stepId: string,
  submission: CaseStepSubmission
): GradedCaseStep {
  if (version.contentSnapshot.contentType !== "progressive_case") {
    throw new Error(`« ${version.id} » n'est pas un mini-cas`);
  }

  const step = version.contentSnapshot.content.steps.find((candidate) => candidate.id === stepId);

  if (!step) {
    throw new Error(`l'étape « ${stepId} » n'existe pas dans « ${version.id} »`);
  }

  const specification = step.answerSpecification;

  if (specification.kind !== submission.kind) {
    throw new Error(
      `réponse de type « ${submission.kind} » pour une étape de type « ${specification.kind} »`
    );
  }

  const points = step.gradingRubric.reduce((sum, item) => sum + item.points, 0) || 1;

  if (specification.kind === "calculation" && submission.kind === "calculation") {
    const value = parseNumericAnswer(submission.raw) ?? Number.NaN;
    const result = numericEvaluator.evaluate(
      {
        expected: specification.expectedValue,
        toleranceAbs: specification.tolerance,
        unit: specification.unit,
        label: step.objective,
        points,
        partialCreditForSign: true
      },
      { value }
    );

    return {
      stepId,
      result,
      passed: passed(result),
      correction: {
        explanation: step.explanation,
        steps: [],
        expectedAnswer: { value: specification.expectedValue, unit: specification.unit }
      }
    };
  }

  if (specification.kind === "journal_entry" && submission.kind === "journal_entry") {
    const result = journalEntryEvaluator.evaluate(
      {
        expectedLines: specification.expectedLines.map((line) => ({
          account: line.accountNumber,
          debit: line.debit > 0 ? line.debit : undefined,
          credit: line.credit > 0 ? line.credit : undefined,
          label: line.accountLabel
        })),
        amountToleranceAbs: 0.01,
        allowExtraLines: false
      },
      { lines: submission.lines.map((line) => ({ ...line })) }
    );

    // Même règle que `gradeJournalEntry` : l'équilibre n'est pas négociable.
    const balance = result.criteria.find((criterion) => criterion.id === "balance");

    return {
      stepId,
      result,
      passed: passed(result) && balance?.outcome === "met",
      correction: {
        explanation: step.explanation,
        steps: [],
        expectedLines: specification.expectedLines.map((line) => ({
          accountNumber: line.accountNumber,
          accountLabel: line.accountLabel,
          debit: line.debit,
          credit: line.credit,
          lineExplanation: line.lineExplanation
        }))
      }
    };
  }

  if (specification.kind === "error_diagnosis" && submission.kind === "error_diagnosis") {
    const correct = submission.category === specification.expectedErrorCategory;

    return {
      stepId,
      passed: correct,
      result: {
        evaluationType: "multiple_choice",
        evaluatorVersion: "published-case-diagnosis@1",
        score: correct ? 20 : 0,
        maxScore: 20,
        criteria: [
          {
            id: "category",
            label: "Nature de l'erreur",
            maxPoints: points,
            awardedPoints: correct ? points : 0,
            outcome: correct ? "met" : "missed",
            justification: correct
              ? "Catégorie exacte."
              : `Catégorie attendue : ${errorCategoryLabels[specification.expectedErrorCategory]}.`
          }
        ],
        feedback: {
          correct: correct ? ["Nature de l'erreur correctement identifiée."] : [],
          partial: [],
          missing: correct ? [] : ["Nature de l'erreur"],
          calculationErrors: [],
          accountingTreatmentErrors: [],
          reasoningErrors: [],
          sourceQualityIssues: []
        }
      },
      correction: {
        explanation: step.explanation,
        steps: [],
        expectedErrorCategory: specification.expectedErrorCategory,
        expectedCorrection: specification.expectedCorrection
      }
    };
  }

  // `short_answer` : déposé, corrigé à la lecture, jamais noté.
  return {
    stepId,
    passed: false,
    result: {
      evaluationType: "short_text_rubric",
      evaluatorVersion: "published-case-short-answer@1",
      score: 0,
      maxScore: 20,
      criteria: [],
      feedback: {
        correct: [],
        partial: [],
        missing: [],
        calculationErrors: [],
        accountingTreatmentErrors: [],
        reasoningErrors: [],
        sourceQualityIssues: []
      }
    },
    correction: {
      explanation: step.explanation,
      steps: [],
      expectedCorrection:
        specification.kind === "short_answer" ? specification.expectedPoints.join("\n") : undefined
    }
  };
}

/** Un indice, à la demande. Les niveaux supérieurs ne voyagent pas avec la page. */
export function revealHint(
  version: PublishedContentVersion,
  stepId: string,
  level: number
): { level: number; hint: string } | null {
  if (version.contentSnapshot.contentType !== "progressive_case") {
    return null;
  }

  const step = version.contentSnapshot.content.steps.find((candidate) => candidate.id === stepId);
  const hint = step?.hintLevels.find((candidate) => candidate.level === level);

  return hint ? { level: hint.level, hint: hint.hint } : null;
}
