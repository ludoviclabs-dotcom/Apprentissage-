import { describe, expect, it } from "vitest";
import { buildPublishedVersion } from "../src/snapshot";
import {
  errorCategoryLabels,
  gradeCalculation,
  gradeCaseStep,
  gradeErrorDiagnosis,
  gradeJournalEntry,
  revealHint,
  totalsOf
} from "../src/grading";
import {
  approvedCalculationDraft,
  approvedCaseDraft,
  approvedDiagnosisDraft,
  approvedJournalDraft,
  calculationContent,
  draftFor
} from "./fixtures";
import type { ContentDraft, ContentPayload } from "@finance/content-generation";

/**
 * Notation déterministe des activités publiées.
 *
 * Les valeurs attendues ne sont pas restatées ici : elles sont lues sur
 * l'instantané, comme le fait le code de production. Recopier « 80 000 » dans le
 * test le rendrait vert le jour où la fixture change et où le grader ne suit pas.
 */

function publish(draft: ContentDraft) {
  return buildPublishedVersion({
    draft,
    publishedBy: "relecteur@example.test",
    publishedAt: "2026-08-01T12:00:00.000Z",
    publicationVersion: 1,
    previousPublishedVersionId: null
  });
}

describe("exercice de calcul", () => {
  const version = publish(approvedCalculationDraft());
  const expected =
    version.contentSnapshot.contentType === "calculation_exercise"
      ? version.contentSnapshot.content.expectedAnswer
      : 0;

  it("accepte la valeur exacte", () => {
    const graded = gradeCalculation(version, { raw: String(expected) });

    expect(graded.passed).toBe(true);
    expect(graded.errorKind).toBe("aucune");
    expect(graded.result.score).toBe(20);
  });

  it("accepte la notation française : virgule décimale et espaces de milliers", () => {
    const graded = gradeCalculation(version, { raw: "80 000,00" });

    expect(graded.passed).toBe(true);
  });

  it("refuse une saisie non numérique et le dit", () => {
    const graded = gradeCalculation(version, { raw: "quatre-vingt mille" });

    expect(graded.passed).toBe(false);
    expect(graded.errorKind).toBe("non-numerique");
    expect(graded.hint).toMatch(/nombre/i);
  });

  it("distingue une erreur d'arrondi d'une erreur de calcul", () => {
    // La règle d'arrondi doit être plus grossière que la tolérance pour que le
    // cas existe : arrondi au centime avec une tolérance de 0,01 € ne laisse
    // aucun écart qui soit hors tolérance *et* rattrapé par l'arrondi. On publie
    // donc une variante « à l'unité », qui est la forme réelle du piège.
    const unitVersion = publish(
      draftFor(
        {
          contentType: "calculation_exercise",
          content: calculationContent({ roundingRule: "unit" })
        } as ContentPayload,
        { id: "draft-calc-unit000" }
      )
    );

    const graded = gradeCalculation(unitVersion, { raw: String(expected + 0.4) });

    expect(graded.errorKind).toBe("arrondi");
    expect(graded.hint).toMatch(/arrondi/i);
  });

  it("distingue une erreur de signe d'un résultat hors tolérance", () => {
    const signError = gradeCalculation(version, { raw: String(-expected) });
    const outOfRange = gradeCalculation(version, { raw: String(expected * 2) });

    expect(signError.errorKind).toBe("signe");
    expect(signError.hint).toMatch(/signe/i);
    expect(outOfRange.errorKind).toBe("hors-tolerance");
  });

  it("classe une inversion de signe comme erreur de traitement, pas de calcul", () => {
    const graded = gradeCalculation(version, { raw: String(-expected) });

    expect(graded.result.feedback.accountingTreatmentErrors.length).toBeGreaterThan(0);
    expect(graded.result.feedback.calculationErrors).toHaveLength(0);
  });

  it("ne rend la correction qu'avec le résultat de la tentative", () => {
    const graded = gradeCalculation(version, { raw: "0" });

    expect(graded.correction.expectedAnswer?.value).toBe(expected);
    expect(graded.correction.steps.length).toBeGreaterThan(0);
    expect(graded.correction.explanation).not.toHaveLength(0);
  });
});

describe("écriture comptable", () => {
  const version = publish(approvedJournalDraft());
  const expectedLines =
    version.contentSnapshot.contentType === "journal_entry_exercise"
      ? version.contentSnapshot.content.expectedLines
      : [];

  const correctSubmission = expectedLines.map((line) => ({
    account: line.accountNumber,
    ...(line.debit > 0 ? { debit: line.debit } : {}),
    ...(line.credit > 0 ? { credit: line.credit } : {})
  }));

  it("accepte l'écriture attendue", () => {
    const graded = gradeJournalEntry(version, correctSubmission);

    expect(graded.passed).toBe(true);
    expect(graded.result.score).toBe(20);
  });

  it("refuse une écriture déséquilibrée", () => {
    const unbalanced = correctSubmission.map((line, index) =>
      index === 0 && line.debit ? { ...line, debit: line.debit + 1000 } : line
    );
    const graded = gradeJournalEntry(version, unbalanced);

    expect(graded.passed).toBe(false);
    expect(graded.result.criteria.some((criterion) => criterion.id.includes("balance"))).toBe(true);
  });

  it("détecte un compte manquant", () => {
    const graded = gradeJournalEntry(version, correctSubmission.slice(0, 2));

    expect(graded.passed).toBe(false);
    expect(graded.result.feedback.missing.length + graded.result.feedback.accountingTreatmentErrors.length)
      .toBeGreaterThan(0);
  });

  it("détecte une inversion débit/crédit sans confondre avec un mauvais compte", () => {
    const reversed = correctSubmission.map((line) =>
      line.debit !== undefined ? { account: line.account, credit: line.debit } : { account: line.account, debit: line.credit }
    );
    const graded = gradeJournalEntry(version, reversed);

    expect(graded.passed).toBe(false);

    const accounts = graded.result.criteria.find((criterion) => criterion.id.includes("account"));
    const direction = graded.result.criteria.find((criterion) => criterion.id.includes("direction"));

    // Les comptes sont bons, le sens ne l'est pas : les deux critères doivent
    // dire des choses différentes.
    expect(accounts?.outcome).toBe("met");
    expect(direction?.outcome).not.toBe("met");
  });

  it("rend l'écriture attendue en correction", () => {
    const graded = gradeJournalEntry(version, correctSubmission.slice(0, 2));

    expect(graded.correction.expectedLines).toHaveLength(expectedLines.length);
  });

  it("calcule les totaux d'une proposition pour l'affichage en direct", () => {
    expect(totalsOf(correctSubmission).balanced).toBe(true);
    expect(totalsOf([{ account: "512", debit: 10 }]).balanced).toBe(false);
  });
});

describe("diagnostic d'erreur", () => {
  const version = publish(approvedDiagnosisDraft());
  const expectedCategory =
    version.contentSnapshot.contentType === "error_diagnosis_exercise"
      ? version.contentSnapshot.content.expectedErrorCategory
      : "no_error";

  it("note la catégorie exacte", () => {
    const graded = gradeErrorDiagnosis(version, { category: expectedCategory });

    expect(graded.passed).toBe(true);
    expect(graded.result.score).toBe(20);
  });

  it("refuse une autre catégorie et nomme celle attendue", () => {
    const wrong = expectedCategory === "no_error" ? "wrong_amount" : "no_error";
    const graded = gradeErrorDiagnosis(version, { category: wrong });

    expect(graded.passed).toBe(false);
    expect(graded.result.score).toBe(0);
    expect(graded.correction.expectedErrorCategory).toBe(expectedCategory);
  });

  it("n'accorde aucun point à la justification libre", () => {
    const wrong = expectedCategory === "no_error" ? "wrong_amount" : "no_error";
    const graded = gradeErrorDiagnosis(version, {
      category: wrong,
      justification: "Il manque la ligne 169 pour la prime de remboursement."
    });

    // La justification décrit exactement la bonne réponse : elle ne doit pas
    // pour autant rattraper la catégorie choisie.
    expect(graded.result.score).toBe(0);
  });

  it("libelle les neuf catégories en français", () => {
    expect(Object.keys(errorCategoryLabels)).toHaveLength(9);

    for (const label of Object.values(errorCategoryLabels)) {
      expect(label).not.toMatch(/_/);
    }
  });
});

describe("mini-cas progressif", () => {
  const version = publish(approvedCaseDraft());
  const steps = version.contentSnapshot.contentType === "progressive_case" ? version.contentSnapshot.content.steps : [];
  const calcStep = steps.find((step) => step.exerciseType === "calculation");
  const entryStep = steps.find((step) => step.exerciseType === "journal_entry");

  it("note une étape de calcul contre sa propre spécification", () => {
    const expected =
      calcStep?.answerSpecification.kind === "calculation" ? calcStep.answerSpecification.expectedValue : 0;
    const graded = gradeCaseStep(version, calcStep!.id, { kind: "calculation", raw: String(expected) });

    expect(graded.passed).toBe(true);
    expect(graded.stepId).toBe(calcStep!.id);
  });

  it("note une étape d'écriture ligne par ligne", () => {
    const lines =
      entryStep?.answerSpecification.kind === "journal_entry"
        ? entryStep.answerSpecification.expectedLines.map((line) => ({
            account: line.accountNumber,
            ...(line.debit > 0 ? { debit: line.debit } : {}),
            ...(line.credit > 0 ? { credit: line.credit } : {})
          }))
        : [];

    expect(gradeCaseStep(version, entryStep!.id, { kind: "journal_entry", lines }).passed).toBe(true);
  });

  it("refuse une réponse dont le type ne correspond pas à l'étape", () => {
    expect(() =>
      gradeCaseStep(version, calcStep!.id, { kind: "journal_entry", lines: [] })
    ).toThrow(/type/);
  });

  it("refuse une étape inconnue", () => {
    expect(() => gradeCaseStep(version, "etape-fantome", { kind: "calculation", raw: "1" })).toThrow(
      /n'existe pas/
    );
  });

  it("déclare les dépendances entre étapes", () => {
    expect(entryStep?.prerequisiteStepIds).toContain(calcStep?.id);
  });

  it("rend un indice à la fois, et rien au-delà du dernier niveau", () => {
    expect(revealHint(version, calcStep!.id, 1)?.level).toBe(1);
    expect(revealHint(version, calcStep!.id, 3)?.level).toBe(3);
    expect(revealHint(version, calcStep!.id, 4)).toBeNull();
  });
});
