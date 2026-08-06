import { describe, expect, it } from "vitest";
import {
  catalogueFromArtifactTypes,
  computeChapterProgress,
  type ChapterActivityEvent
} from "../src/progress";

/**
 * Progression d'un chapitre.
 *
 * Elle est pure : chaque test est une liste d'événements et un état attendu.
 * C'est ce qui rend le calcul explicable à l'apprenant — et vérifiable ici sans
 * base, sans horloge et sans rendu.
 */

const FULL_CATALOGUE = catalogueFromArtifactTypes([
  "smart_revision_sheet",
  "flashcard",
  "calculation_exercise",
  "journal_entry_exercise",
  "error_diagnosis_exercise",
  "progressive_case"
]);

function event(
  kind: ChapterActivityEvent["kind"],
  succeeded: boolean,
  artifactId = kind,
  occurredAt = "2026-08-01T10:00:00.000Z"
): ChapterActivityEvent {
  return { kind, succeeded, artifactId, occurredAt };
}

describe("catalogue des dimensions", () => {
  it("ne réclame que ce que le chapitre publie", () => {
    const catalogue = catalogueFromArtifactTypes(["flashcard"]);

    expect([...catalogue.availableKinds]).toEqual(["flashcard_reviewed"]);
  });

  it("une fiche ouvre à la fois la consultation et le rappel actif", () => {
    const catalogue = catalogueFromArtifactTypes(["smart_revision_sheet"]);

    expect([...catalogue.availableKinds].sort()).toEqual(["active_recall", "sheet_viewed"]);
  });

  it("un chapitre vide ne réclame rien", () => {
    expect([...catalogueFromArtifactTypes([]).availableKinds]).toEqual([]);
  });
});

describe("statut du chapitre", () => {
  it("rend « non commencé » sans aucune activité, jamais un pourcentage", () => {
    const progress = computeChapterProgress([], FULL_CATALOGUE);

    expect(progress.status).toBe("not-started");
    expect(progress.acquiredDimensions).toBe(0);
    expect(progress.totalAttempts).toBe(0);
    expect(progress.lastActivityAt).toBeNull();
  });

  it("ouvrir la fiche ne suffit pas à dépasser « en cours »", () => {
    const progress = computeChapterProgress([event("sheet_viewed", true)], FULL_CATALOGUE);

    expect(progress.status).toBe("in-progress");
    expect(progress.acquiredDimensions).toBe(1);
    expect(progress.availableDimensions).toBe(7);
  });

  it("passe « à revoir » dès qu'un échec n'a pas été rattrapé", () => {
    const progress = computeChapterProgress(
      [event("sheet_viewed", true), event("calculation_attempt", false, "calc-1")],
      FULL_CATALOGUE
    );

    expect(progress.status).toBe("to-review");
    expect(progress.outstandingFailures).toBe(1);
  });

  it("cesse d'être « à revoir » quand la dernière tentative réussit", () => {
    const progress = computeChapterProgress(
      [
        event("calculation_attempt", false, "calc-1", "2026-08-01T10:00:00.000Z"),
        event("calculation_attempt", true, "calc-1", "2026-08-02T10:00:00.000Z")
      ],
      catalogueFromArtifactTypes(["calculation_exercise"])
    );

    expect(progress.outstandingFailures).toBe(0);
    expect(progress.status).toBe("mastered");
  });

  it("rend « maîtrisé » quand toutes les dimensions disponibles sont acquises", () => {
    const catalogue = catalogueFromArtifactTypes(["calculation_exercise", "journal_entry_exercise"]);
    const progress = computeChapterProgress(
      [event("calculation_attempt", true, "calc-1"), event("journal_entry_attempt", true, "journal-1")],
      catalogue
    );

    expect(progress.status).toBe("mastered");
    expect(progress.acquiredDimensions).toBe(2);
    expect(progress.availableDimensions).toBe(2);
  });

  it("ne compte pas une dimension que le chapitre ne publie pas", () => {
    // Le chapitre n'a pas de mini-cas : ne pas en avoir fait ne doit pas
    // empêcher la maîtrise.
    const catalogue = catalogueFromArtifactTypes(["flashcard"]);
    const progress = computeChapterProgress(
      [event("flashcard_reviewed", true, "c1"), event("flashcard_reviewed", true, "c2")],
      catalogue
    );

    expect(progress.availableDimensions).toBe(1);
    expect(progress.status).toBe("mastered");
    expect(progress.dimensions.find((dimension) => dimension.kind === "case_step_attempt")?.available).toBe(
      false
    );
  });
});

describe("exigences par dimension", () => {
  it("demande deux rappels actifs, une seule écriture réussie", () => {
    const catalogue = catalogueFromArtifactTypes(["smart_revision_sheet", "journal_entry_exercise"]);
    const oneRecall = computeChapterProgress(
      [
        event("sheet_viewed", true),
        event("active_recall", true, "q1"),
        event("journal_entry_attempt", true, "journal-1")
      ],
      catalogue
    );

    expect(oneRecall.status).toBe("in-progress");
    expect(oneRecall.dimensions.find((dimension) => dimension.kind === "active_recall")?.acquired).toBe(
      false
    );
    expect(
      oneRecall.dimensions.find((dimension) => dimension.kind === "journal_entry_attempt")?.acquired
    ).toBe(true);

    const twoRecalls = computeChapterProgress(
      [
        event("sheet_viewed", true),
        event("active_recall", true, "q1"),
        event("active_recall", true, "q2"),
        event("journal_entry_attempt", true, "journal-1")
      ],
      catalogue
    );

    expect(twoRecalls.status).toBe("mastered");
  });

  it("compte les tentatives et les réussites séparément", () => {
    const progress = computeChapterProgress(
      [
        event("calculation_attempt", false, "calc-1", "2026-08-01T10:00:00.000Z"),
        event("calculation_attempt", true, "calc-1", "2026-08-02T10:00:00.000Z")
      ],
      catalogueFromArtifactTypes(["calculation_exercise"])
    );

    const dimension = progress.dimensions.find((entry) => entry.kind === "calculation_attempt");

    expect(dimension).toMatchObject({ attempts: 2, successes: 1, acquired: true });
    expect(progress.totalAttempts).toBe(2);
  });

  it("retient la date de la dernière activité", () => {
    const progress = computeChapterProgress(
      [
        event("sheet_viewed", true, "sheet", "2026-08-01T10:00:00.000Z"),
        event("active_recall", true, "q1", "2026-08-05T18:30:00.000Z")
      ],
      FULL_CATALOGUE
    );

    expect(progress.lastActivityAt).toBe("2026-08-05T18:30:00.000Z");
  });
});

describe("artefacts retirés et mini-cas complets", () => {
  const CASE_ID = "pub-progressive-case-x";

  it("écarte un échec porté par un artefact qui n'est plus publié", () => {
    // Après un archivage, la route refuse l'ancien identifiant et la réussite
    // sur le remplaçant en porte un autre : sans ce filtre, l'apprenant restait
    // « à revoir » pour toujours sur un contenu qu'il ne pouvait plus ouvrir.
    const catalogue = catalogueFromArtifactTypes(["calculation_exercise"], {
      activeArtifactIds: new Set(["calc-v2"])
    });

    const progress = computeChapterProgress(
      [event("calculation_attempt", false, "calc-v1"), event("calculation_attempt", true, "calc-v2")],
      catalogue
    );

    expect(progress.outstandingFailures).toBe(0);
    expect(progress.totalAttempts).toBe(1);
    expect(progress.status).toBe("mastered");
  });

  it("ne filtre rien quand la liste active n'est pas connue", () => {
    const progress = computeChapterProgress(
      [event("calculation_attempt", false, "calc-v1")],
      catalogueFromArtifactTypes(["calculation_exercise"])
    );

    expect(progress.outstandingFailures).toBe(1);
  });

  it("n'acquiert « mini-cas terminé » qu'une fois toutes les étapes réussies", () => {
    const catalogue = catalogueFromArtifactTypes(["progressive_case"], {
      activeArtifactIds: new Set([CASE_ID]),
      caseStepIds: new Map([[CASE_ID, new Set(["prime", "ecriture"])]])
    });

    const onlyFirst = computeChapterProgress(
      [event("case_step_attempt", true, `${CASE_ID}#prime`)],
      catalogue
    );

    expect(onlyFirst.dimensions.find((d) => d.kind === "case_step_attempt")?.acquired).toBe(false);
    expect(onlyFirst.status).toBe("in-progress");

    const both = computeChapterProgress(
      [
        event("case_step_attempt", true, `${CASE_ID}#prime`),
        event("case_step_attempt", true, `${CASE_ID}#ecriture`)
      ],
      catalogue
    );

    expect(both.dimensions.find((d) => d.kind === "case_step_attempt")?.acquired).toBe(true);
    expect(both.status).toBe("mastered");
  });

  it("ne prend pas la même étape réussie deux fois pour deux étapes", () => {
    const catalogue = catalogueFromArtifactTypes(["progressive_case"], {
      activeArtifactIds: new Set([CASE_ID]),
      caseStepIds: new Map([[CASE_ID, new Set(["prime", "ecriture"])]])
    });

    const progress = computeChapterProgress(
      [
        event("case_step_attempt", true, `${CASE_ID}#prime`, "2026-08-01T10:00:00.000Z"),
        event("case_step_attempt", true, `${CASE_ID}#prime`, "2026-08-02T10:00:00.000Z")
      ],
      catalogue
    );

    expect(progress.dimensions.find((d) => d.kind === "case_step_attempt")?.acquired).toBe(false);
  });
});
