import { describe, expect, it } from "vitest";
import { buildPublishedVersion } from "../src/snapshot";
import {
  revealFlashcard,
  toPublicCalculationExercise,
  toPublicErrorDiagnosisExercise,
  toPublicFlashcardFront,
  toPublicJournalEntryExercise,
  toPublicProgressiveCase,
  toPublicSourceReferences
} from "../src/public/projection";
import {
  approvedCalculationDraft,
  approvedCaseDraft,
  approvedDiagnosisDraft,
  approvedJournalDraft,
  courseReference,
  draftFor
} from "./fixtures";
import type { ContentDraft, ContentPayload } from "@finance/content-generation";

/**
 * Ce qui traverse la frontière vers le navigateur.
 *
 * Les assertions sont écrites en négatif — « la réponse n'est pas là » — parce
 * que c'est la propriété qui compte : une projection qui oublierait de retirer
 * `expectedAnswer` rendrait la notation serveur inutile, et un test qui ne
 * vérifie que les champs présents ne le verrait pas.
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

function flashcardDraft(): ContentDraft {
  return draftFor(
    {
      contentType: "flashcard",
      content: {
        type: "account",
        front: "Quel compte est crédité à la souscription d'un emprunt obligataire ?",
        back: "Le compte 163, pour le prix de remboursement.",
        explanation: "La dette est constatée pour ce qui devra être remboursé.",
        learningObjective: "Mémoriser le compte de dette obligataire.",
        sourceReferences: [courseReference],
        difficulty: 2,
        tags: ["comptes"],
        relatedConceptIds: [],
        atomicityCheck: { testedFactCount: 1, singleFocus: true, justification: "Une seule notion." }
      }
    } as ContentPayload,
    { id: "draft-card00000000" }
  );
}

describe("flashcard", () => {
  const version = publish(flashcardDraft());

  it("n'expose que le recto avant révélation", () => {
    const front = toPublicFlashcardFront(version);
    const serialized = JSON.stringify(front);

    expect(front.front).toContain("Quel compte");
    expect(serialized).not.toContain("163");
    expect(serialized).not.toContain("explanation");
  });

  it("rend le verso, l'explication et la source à la révélation", () => {
    const revealed = revealFlashcard(version);

    expect(revealed.back).toContain("163");
    expect(revealed.explanation).not.toHaveLength(0);
    expect(revealed.sources.length).toBeGreaterThan(0);
  });
});

describe("exercice de calcul", () => {
  const version = publish(approvedCalculationDraft());

  it("livre l'énoncé sans la réponse ni la correction", () => {
    const exercise = toPublicCalculationExercise(version);
    const serialized = JSON.stringify(exercise);

    expect(exercise.statement).not.toHaveLength(0);
    expect(serialized).not.toContain("expectedAnswer");
    expect(serialized).not.toContain("calculationSteps");
    expect(serialized).not.toContain("gradingRubric");
    expect(serialized).not.toContain("80000");
  });

  it("garde les consignes de forme, qui ne sont pas la réponse", () => {
    const exercise = toPublicCalculationExercise(version);

    expect(exercise.unit).toBe("€");
    expect(exercise.tolerance).toBe(0.01);
    expect(exercise.roundingRule).toBe("cent");
  });
});

describe("écriture comptable", () => {
  const version = publish(approvedJournalDraft());

  it("livre l'énoncé sans l'écriture attendue ni les comptes requis", () => {
    const exercise = toPublicJournalEntryExercise(version);
    const serialized = JSON.stringify(exercise);

    expect(serialized).not.toContain("expectedLines");
    expect(serialized).not.toContain("requiredAccounts");
    expect(serialized).not.toContain("4671");
    expect(serialized).not.toContain("8048000");
  });

  it("annonce le nombre de lignes attendu, qui est un cadrage et non une réponse", () => {
    expect(toPublicJournalEntryExercise(version).expectedLineCount).toBe(3);
  });
});

describe("diagnostic d'erreur", () => {
  const version = publish(approvedDiagnosisDraft());

  it("montre l'écriture fautive mais pas la bonne catégorie", () => {
    const exercise = toPublicErrorDiagnosisExercise(version);
    const serialized = JSON.stringify(exercise);

    expect(exercise.proposedEntry?.length).toBeGreaterThan(0);
    expect(exercise.errorCategories.length).toBeGreaterThan(1);
    expect(serialized).not.toContain("expectedErrorCategory");
    expect(serialized).not.toContain("expectedCorrection");
  });
});

describe("mini-cas", () => {
  const version = publish(approvedCaseDraft());

  it("livre les étapes sans leur spécification de réponse ni leurs indices", () => {
    const kase = toPublicProgressiveCase(version);
    const serialized = JSON.stringify(kase);

    expect(kase.steps).toHaveLength(2);
    expect(serialized).not.toContain("answerSpecification");
    expect(serialized).not.toContain("expectedValue");
    expect(serialized).not.toContain("hintLevels");
    expect(serialized).not.toContain("finalSynthesis");
    // Le nombre d'indices voyage, leur texte non.
    expect(kase.steps[0].hintCount).toBe(3);
    expect(serialized).not.toContain("Prime unitaire = remboursement");
  });

  it("garde les dépendances entre étapes, qui pilotent le déverrouillage", () => {
    const kase = toPublicProgressiveCase(version);

    expect(kase.steps[1].prerequisiteStepIds).toContain(kase.steps[0].id);
  });

  it("ordonne les étapes", () => {
    const kase = toPublicProgressiveCase(version);

    expect(kase.steps.map((step) => step.order)).toEqual([1, 2]);
  });
});

describe("sources publiques", () => {
  const version = publish(approvedCalculationDraft());

  it("n'expose ni chemin, ni extrait, ni empreinte de fragment", () => {
    const sources = toPublicSourceReferences(version.sourceReferencesSnapshot);
    const serialized = JSON.stringify(sources);

    expect(sources.length).toBeGreaterThan(0);
    expect(serialized).not.toContain("excerpt");
    expect(serialized).not.toContain("relativePath");
    expect(serialized).not.toContain(".pdf");
    expect(serialized).not.toMatch(/[A-Za-z]:\\/);
  });

  it("expose de quoi retrouver le passage : titre, nature, section, pages", () => {
    const [source] = toPublicSourceReferences(version.sourceReferencesSnapshot);

    expect(source.documentTitle).not.toHaveLength(0);
    expect(source.sourceType).toBe("exercise");
    expect(source.sectionTitle).toBe("Données");
    expect(source.pageStart).toBeGreaterThan(0);
  });
});
