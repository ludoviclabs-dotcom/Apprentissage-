import { runTemplate } from "../calc/templates";
import {
  collectSourceReferences,
  contentPayloadSchema,
  type ContentPayload
} from "../types/artifact";
import type { ValidationIssue, ValidationMetadata } from "../types/metadata";
import type { NormativeContext } from "../types/normative-context";
import {
  sourceReferenceSchema,
  verifyReference,
  type CorpusIndex
} from "../types/source-reference";
import { checkNormativeContext } from "./normative";
import { answerAddsNothingNew, answerLeakRatio, jaccardSimilarity, normalizeForComparison } from "./text";

/**
 * Moteur de contrôles déterministes.
 *
 * Il ne corrige jamais : il constate. Un résultat numérique qui diverge du
 * recalcul est signalé avec l'écart exact, pas remplacé par la bonne valeur —
 * une correction silencieuse masquerait le fait que le générateur s'est trompé,
 * et c'est précisément l'information qu'un relecteur doit avoir.
 */

export const VALIDATION_VERSION = "content-validation.v1";

/** Au-delà, deux cartes sont considérées comme des quasi-doublons. */
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.85;
/** Au-delà, le recto d'une carte révèle sa propre réponse. */
export const ANSWER_LEAK_THRESHOLD = 0.7;
/** Au-delà, une carte teste probablement plus d'une chose. */
export const MAX_ATOMIC_FACTS = 1;

export interface ValidationInput {
  payload: ContentPayload;
  corpus: CorpusIndex;
  /** Contenus déjà retenus, pour la détection de doublons entre brouillons. */
  siblings?: readonly ContentPayload[];
  /**
   * Le référentiel selon lequel le contenu se déclare vrai.
   *
   * Il vient de l'enveloppe du brouillon, pas du contenu : le générateur ne le
   * rédige pas, un relecteur le décide. Absent, les contrôles normatifs
   * avertissent au lieu de refuser — voir `checkNormativeContext`.
   */
  normativeContext?: NormativeContext | null;
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  qualityScore: number;
  blockingReasons: string[];
}

function error(code: string, message: string, path?: string): ValidationIssue {
  return { code, message, path, severity: "error" };
}

function warning(code: string, message: string, path?: string): ValidationIssue {
  return { code, message, path, severity: "warning" };
}

/** Motifs qui n'ont rien à faire dans un contenu destiné au navigateur. */
const ABSOLUTE_PATH_PATTERN = /(?:[A-Za-z]:[\\/])|(?:\/(?:home|Users)\/)|(?:\\\\[A-Za-z0-9_-]+\\)/;
const SECRET_PATTERN = /\b(?:sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]\s*\S+|Bearer\s+[A-Za-z0-9._-]{20,})/i;

function checkForbiddenStrings(payload: ContentPayload, errors: ValidationIssue[]): void {
  const serialized = JSON.stringify(payload.content);

  if (ABSOLUTE_PATH_PATTERN.test(serialized)) {
    errors.push(
      error(
        "chemin-absolu",
        "le contenu comporte un chemin de fichier absolu — les sources privées ne doivent jamais atteindre le navigateur"
      )
    );
  }

  if (SECRET_PATTERN.test(serialized)) {
    errors.push(error("secret-detecte", "le contenu comporte ce qui ressemble à une clé ou un jeton"));
  }
}

function checkReferences(
  payload: ContentPayload,
  corpus: CorpusIndex,
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  const collected = collectSourceReferences(payload);

  if (collected.length === 0) {
    errors.push(error("aucune-source", "le contenu ne cite aucune source"));
    return;
  }

  for (const { path, reference } of collected) {
    const parsed = sourceReferenceSchema.safeParse(reference);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors.push(error("source-malformee", issue.message, `${path}.${issue.path.join(".")}`));
      }
      continue;
    }

    const verification = verifyReference(parsed.data, corpus);

    for (const problem of verification.problems) {
      errors.push(error(problem.code, problem.message, path));
    }

    for (const problem of verification.warnings) {
      warnings.push(warning(problem.code, problem.message, path));
    }
  }
}

function checkFlashcard(payload: ContentPayload, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  if (payload.contentType !== "flashcard") {
    return;
  }

  const card = payload.content;

  if (card.atomicityCheck.testedFactCount > MAX_ATOMIC_FACTS || !card.atomicityCheck.singleFocus) {
    errors.push(
      error(
        "carte-non-atomique",
        `la carte annonce tester ${card.atomicityCheck.testedFactCount} connaissance(s) — une carte doit en tester exactement une`,
        "content.atomicityCheck"
      )
    );
  }

  // Contre-vérification indépendante de ce que le générateur a déclaré.
  const questionMarks = (card.front.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    errors.push(
      error(
        "carte-non-atomique",
        `le recto pose ${questionMarks} questions — une carte doit en poser une seule`,
        "content.front"
      )
    );
  }

  // Bloquant : le verso n'apporte rien que le recto ne disait déjà.
  if (answerAddsNothingNew(card.front, card.back)) {
    errors.push(
      error(
        "reponse-dans-question",
        "le verso n'apporte aucun terme absent du recto — la question contient déjà sa réponse",
        "content.front"
      )
    );
  } else {
    // Simple signal : le recouvrement est fort mais la réponse apporte quand
    // même l'essentiel (un numéro de compte, un montant, un terme technique).
    const leak = answerLeakRatio(card.front, card.back);

    if (leak >= ANSWER_LEAK_THRESHOLD) {
      warnings.push(
        warning(
          "recouvrement-fort",
          `le recto reprend ${Math.round(leak * 100)} % des mots du verso — vérifier que la question ne guide pas trop`,
          "content.front"
        )
      );
    }
  }

  if (normalizeForComparison(card.front) === normalizeForComparison(card.back)) {
    errors.push(error("recto-verso-identiques", "le recto et le verso sont identiques", "content"));
  }

  if (card.type === "formula" && !/[=+\-×*/]/.test(card.back)) {
    warnings.push(
      warning(
        "type-incoherent",
        "carte de type « formula » dont le verso ne comporte aucune expression",
        "content.back"
      )
    );
  }

  if (card.type === "account" && !/\d{2,8}/.test(`${card.front} ${card.back}`)) {
    warnings.push(
      warning("type-incoherent", "carte de type « account » sans numéro de compte", "content")
    );
  }
}

function checkDuplicates(
  payload: ContentPayload,
  siblings: readonly ContentPayload[],
  errors: ValidationIssue[],
  warnings: ValidationIssue[]
): void {
  if (payload.contentType !== "flashcard") {
    return;
  }

  const card = payload.content;
  const frontKey = normalizeForComparison(card.front);
  const backKey = normalizeForComparison(card.back);

  for (const sibling of siblings) {
    if (sibling.contentType !== "flashcard") {
      continue;
    }

    const other = sibling.content;
    const otherFront = normalizeForComparison(other.front);

    if (otherFront === frontKey && normalizeForComparison(other.back) === backKey) {
      errors.push(
        error("doublon-exact", `une carte au recto et verso identiques existe déjà : « ${other.front} »`, "content")
      );
      return;
    }

    const similarity = jaccardSimilarity(card.front, other.front);
    if (similarity >= DUPLICATE_SIMILARITY_THRESHOLD) {
      warnings.push(
        warning(
          "doublon-probable",
          `recto très proche d'une autre carte (${Math.round(similarity * 100)} % de mots communs) : « ${other.front} »`,
          "content.front"
        )
      );
    }
  }
}

function checkCalculation(payload: ContentPayload, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  if (payload.contentType !== "calculation_exercise") {
    return;
  }

  const exercise = payload.content;
  const run = runTemplate(exercise.formulaTemplateId, exercise.templateInputs, exercise.roundingRule);

  if (!run.ok || run.rounded === undefined) {
    errors.push(
      error("calcul-impossible", `le recalcul a échoué : ${run.error ?? "raison inconnue"}`, "content.templateInputs")
    );
    return;
  }

  const gap = Math.abs(run.rounded - exercise.expectedAnswer);

  if (gap > exercise.tolerance) {
    errors.push(
      error(
        "resultat-divergent",
        `réponse annoncée ${exercise.expectedAnswer} ${exercise.unit}, recalculée ${run.rounded} ${exercise.unit} ` +
          `(écart ${gap.toFixed(4)}, tolérance ${exercise.tolerance}) — aucune correction automatique n'est appliquée`,
        "content.expectedAnswer"
      )
    );
  }

  // Les entrées du calcul doivent provenir de l'énoncé, pas de nulle part.
  const variablesByName = new Map(exercise.variables.map((variable) => [variable.name, variable]));

  for (const [inputName, inputValue] of Object.entries(exercise.templateInputs)) {
    const variable = variablesByName.get(inputName);

    if (!variable) {
      warnings.push(
        warning(
          "entree-hors-enonce",
          `l'entrée « ${inputName} » du calcul ne correspond à aucune variable de l'énoncé`,
          "content.templateInputs"
        )
      );
      continue;
    }

    if (variable.value !== inputValue) {
      errors.push(
        error(
          "entree-incoherente",
          `l'entrée « ${inputName} » vaut ${inputValue} dans le calcul mais ${variable.value} dans l'énoncé`,
          "content.templateInputs"
        )
      );
    }
  }

  const totalPoints = exercise.gradingRubric.reduce((sum, item) => sum + item.points, 0);
  if (totalPoints <= 0) {
    errors.push(error("bareme-nul", "le barème totalise zéro point", "content.gradingRubric"));
  }
}

function roundToCent(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function checkJournalEntry(payload: ContentPayload, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  if (payload.contentType !== "journal_entry_exercise") {
    return;
  }

  const exercise = payload.content;
  const totalDebit = roundToCent(exercise.expectedLines.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = roundToCent(exercise.expectedLines.reduce((sum, line) => sum + line.credit, 0));

  if (totalDebit !== totalCredit) {
    errors.push(
      error(
        "ecriture-desequilibree",
        `total débit ${totalDebit} ≠ total crédit ${totalCredit} — l'écriture ne peut pas être proposée`,
        "content.expectedLines"
      )
    );
  }

  if (roundToCent(exercise.expectedTotalDebit) !== totalDebit) {
    errors.push(
      error(
        "total-declare-faux",
        `expectedTotalDebit annoncé ${exercise.expectedTotalDebit}, recalculé ${totalDebit}`,
        "content.expectedTotalDebit"
      )
    );
  }

  if (roundToCent(exercise.expectedTotalCredit) !== totalCredit) {
    errors.push(
      error(
        "total-declare-faux",
        `expectedTotalCredit annoncé ${exercise.expectedTotalCredit}, recalculé ${totalCredit}`,
        "content.expectedTotalCredit"
      )
    );
  }

  const presentAccounts = new Set(exercise.expectedLines.map((line) => line.accountNumber));
  const alternatives = new Set(exercise.allowedAlternativeAccounts);

  for (const required of exercise.requiredAccounts) {
    if (!presentAccounts.has(required) && !alternatives.has(required)) {
      errors.push(
        error(
          "compte-requis-absent",
          `le compte requis ${required} ne figure dans aucune ligne de l'écriture attendue`,
          "content.requiredAccounts"
        )
      );
    }
  }

  const seen = new Set<string>();
  for (const line of exercise.expectedLines) {
    const key = `${line.accountNumber}:${line.debit}:${line.credit}`;
    if (seen.has(key)) {
      warnings.push(
        warning("ligne-dupliquee", `ligne identique répétée sur le compte ${line.accountNumber}`, "content.expectedLines")
      );
    }
    seen.add(key);
  }

  const totalPoints = exercise.gradingRubric.reduce((sum, item) => sum + item.points, 0);
  if (totalPoints <= 0) {
    errors.push(error("bareme-nul", "le barème totalise zéro point", "content.gradingRubric"));
  }
}

/**
 * Les compétences visées ne peuvent pas être des étiquettes vides : un exercice
 * rattaché à « » ne nourrit aucune progression. Le schéma exige la présence,
 * ce contrôle exige le contenu.
 */
function checkCompetencyTags(payload: ContentPayload, errors: ValidationIssue[]): void {
  const tagged = payload.content as { competencyTags?: unknown };

  if (!Array.isArray(tagged.competencyTags)) {
    return;
  }

  const blank = tagged.competencyTags.filter(
    (tag) => typeof tag !== "string" || tag.trim().length === 0
  );

  if (blank.length > 0) {
    errors.push(
      error("competence-vide", "une compétence visée est vide ou n'est pas un libellé", "content.competencyTags")
    );
  }

  const normalized = tagged.competencyTags
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => normalizeForComparison(tag));

  if (new Set(normalized).size !== normalized.length) {
    errors.push(
      error("competence-dupliquee", "la même compétence est visée deux fois", "content.competencyTags")
    );
  }
}

function checkErrorDiagnosis(payload: ContentPayload, errors: ValidationIssue[]): void {
  if (payload.contentType !== "error_diagnosis_exercise") {
    return;
  }

  const exercise = payload.content;

  // Seul cas réellement contradictoire : annoncer qu'il n'y a pas d'erreur alors
  // que l'écriture proposée ne s'équilibre pas. Une écriture équilibrée peut
  // parfaitement porter un montant faux (reporté des deux côtés) ou un mauvais
  // compte — l'équilibre ne prouve donc rien dans les autres cas.
  if (exercise.proposedEntry && exercise.expectedErrorCategory === "no_error") {
    const totalDebit = roundToCent(exercise.proposedEntry.reduce((sum, line) => sum + line.debit, 0));
    const totalCredit = roundToCent(exercise.proposedEntry.reduce((sum, line) => sum + line.credit, 0));

    if (totalDebit !== totalCredit) {
      errors.push(
        error(
          "diagnostic-incoherent",
          `la réponse attendue est « aucune erreur » alors que l'écriture proposée est déséquilibrée (débit ${totalDebit}, crédit ${totalCredit})`,
          "content.proposedEntry"
        )
      );
    }
  }

  if (exercise.gradingRubric.reduce((sum, item) => sum + item.points, 0) <= 0) {
    errors.push(error("bareme-nul", "le barème totalise zéro point", "content.gradingRubric"));
  }
}

function checkProgressiveCase(payload: ContentPayload, errors: ValidationIssue[], warnings: ValidationIssue[]): void {
  if (payload.contentType !== "progressive_case") {
    return;
  }

  const kase = payload.content;
  const stepIds = kase.steps.map((step) => step.id);
  const idSet = new Set(stepIds);

  if (idSet.size !== stepIds.length) {
    errors.push(error("etape-dupliquee", "deux étapes portent le même identifiant", "content.steps"));
  }

  const orders = kase.steps.map((step) => step.order);
  const sorted = [...orders].sort((left, right) => left - right);
  if (orders.some((value, index) => value !== sorted[index])) {
    warnings.push(warning("ordre-non-croissant", "les étapes ne sont pas listées dans l'ordre", "content.steps"));
  }

  const orderById = new Map(kase.steps.map((step) => [step.id, step.order]));

  for (const step of kase.steps) {
    for (const prerequisite of step.prerequisiteStepIds) {
      if (!idSet.has(prerequisite)) {
        errors.push(
          error(
            "prerequis-inconnu",
            `l'étape « ${step.id} » dépend de « ${prerequisite} », qui n'existe pas`,
            `content.steps.${step.id}.prerequisiteStepIds`
          )
        );
        continue;
      }

      const prerequisiteOrder = orderById.get(prerequisite);
      if (prerequisiteOrder !== undefined && prerequisiteOrder >= step.order) {
        errors.push(
          error(
            "dependance-circulaire",
            `l'étape « ${step.id} » (rang ${step.order}) dépend de « ${prerequisite} » (rang ${prerequisiteOrder}) — une étape ne peut dépendre que d'une étape antérieure`,
            `content.steps.${step.id}.prerequisiteStepIds`
          )
        );
      }
    }

    if (step.answerSpecification.kind !== step.exerciseType) {
      errors.push(
        error(
          "specification-incoherente",
          `l'étape « ${step.id} » est de type « ${step.exerciseType} » mais sa réponse est spécifiée comme « ${step.answerSpecification.kind} »`,
          `content.steps.${step.id}.answerSpecification`
        )
      );
    }

    if (step.answerSpecification.kind === "journal_entry") {
      const totalDebit = roundToCent(
        step.answerSpecification.expectedLines.reduce((sum, line) => sum + line.debit, 0)
      );
      const totalCredit = roundToCent(
        step.answerSpecification.expectedLines.reduce((sum, line) => sum + line.credit, 0)
      );

      if (totalDebit !== totalCredit) {
        errors.push(
          error(
            "ecriture-desequilibree",
            `l'étape « ${step.id} » attend une écriture déséquilibrée (débit ${totalDebit}, crédit ${totalCredit})`,
            `content.steps.${step.id}.answerSpecification`
          )
        );
      }
    }

    const stepPoints = step.gradingRubric.reduce((sum, item) => sum + item.points, 0);
    if (stepPoints <= 0) {
      errors.push(
        error("bareme-nul", `l'étape « ${step.id} » totalise zéro point`, `content.steps.${step.id}.gradingRubric`)
      );
    }

    const hintLevels = step.hintLevels.map((hint) => hint.level);
    if (new Set(hintLevels).size !== hintLevels.length) {
      warnings.push(
        warning("indices-dupliques", `l'étape « ${step.id} » a deux indices de même niveau`, `content.steps.${step.id}.hintLevels`)
      );
    }
  }
}

function checkSheet(payload: ContentPayload, warnings: ValidationIssue[]): void {
  if (payload.contentType !== "smart_revision_sheet") {
    return;
  }

  const sheet = payload.content;

  // Vides tolérés mais jamais silencieux : le relecteur doit savoir que la
  // fiche est incomplète parce que les sources ne disaient rien de plus.
  if (sheet.accountMap.length === 0) {
    warnings.push(warning("carte-comptes-vide", "aucun compte relevé — vérifier que les sources n'en citent pas", "content.accountMap"));
  }

  if (sheet.formulas.length === 0) {
    warnings.push(warning("formules-vides", "aucune formule relevée — vérifier que les sources n'en citent pas", "content.formulas"));
  }

  if (sheet.timelineSteps.length === 0) {
    warnings.push(warning("chronologie-vide", "aucune chronologie relevée", "content.timelineSteps"));
  }

  if (sheet.commonMistakes.length === 0) {
    warnings.push(warning("erreurs-frequentes-vides", "aucune erreur fréquente relevée", "content.commonMistakes"));
  }

  const kinds = new Set(sheet.workedExample.steps.map((step) => step.kind));
  for (const required of ["data", "result"] as const) {
    if (!kinds.has(required)) {
      warnings.push(
        warning(
          "exemple-incomplet",
          `l'exemple résolu ne comporte pas d'étape « ${required} »`,
          "content.workedExample.steps"
        )
      );
    }
  }
}

/**
 * Score indicatif : 100 moins le poids des problèmes. Il sert à trier la file de
 * revue, jamais à autoriser une approbation — celle-ci exige `passed`.
 */
function computeQualityScore(errors: ValidationIssue[], warnings: ValidationIssue[]): number {
  const penalty = errors.length * 25 + warnings.length * 5;
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function validateContent(input: ValidationInput): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const parsed = contentPayloadSchema.safeParse(input.payload);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(error("schema-invalide", issue.message, issue.path.join(".")));
    }

    return {
      passed: false,
      errors,
      warnings,
      qualityScore: 0,
      blockingReasons: ["le contenu ne respecte pas son schéma"]
    };
  }

  const payload = parsed.data;

  checkForbiddenStrings(payload, errors);
  checkReferences(payload, input.corpus, errors, warnings);
  checkSheet(payload, warnings);
  checkCompetencyTags(payload, errors);
  checkFlashcard(payload, errors, warnings);
  checkDuplicates(payload, input.siblings ?? [], errors, warnings);
  checkCalculation(payload, errors, warnings);
  checkJournalEntry(payload, errors, warnings);
  checkErrorDiagnosis(payload, errors);
  checkProgressiveCase(payload, errors, warnings);

  const normative = checkNormativeContext({ payload, normativeContext: input.normativeContext });
  errors.push(...normative.errors);
  warnings.push(...normative.warnings);

  const blockingReasons = [...new Set(errors.map((issue) => issue.code))].map((code) => {
    const first = errors.find((issue) => issue.code === code);
    return `${code} : ${first?.message ?? ""}`;
  });

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    qualityScore: computeQualityScore(errors, warnings),
    blockingReasons
  };
}

export function toValidationMetadata(result: ValidationResult, validatedAt: string): ValidationMetadata {
  return {
    passed: result.passed,
    validationVersion: VALIDATION_VERSION,
    validatedAt,
    errors: result.errors,
    warnings: result.warnings,
    qualityScore: result.qualityScore,
    blockingReasons: result.blockingReasons
  };
}
