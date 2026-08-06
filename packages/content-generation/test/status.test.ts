import { describe, expect, it } from "vitest";
import {
  advanceAfterValidation,
  allowedTransitions,
  applyTransition,
  assertTransition,
  canTransition,
  contentDraftStatuses,
  InvalidTransitionError,
  isTerminal
} from "../src";
import type { ContentDraft } from "../src";
import { flashcardPayload } from "./fixtures";

function draftAt(status: (typeof contentDraftStatuses)[number]): ContentDraft {
  return {
    id: "draft-test",
    status,
    chapterSlug: "les-emprunts-obligataires",
    chapterLabel: "Les emprunts obligataires",
    domainId: "compta-generale",
    title: "Carte de test",
    difficulty: 2,
    generationMetadata: {
      provider: "mock",
      model: "fixture.v1",
      promptId: "flashcard-atomic",
      promptVersion: "v1",
      generatedAt: "2026-08-05T10:00:00.000Z",
      inputHash: "d".repeat(64),
      sourcePackId: "test-pack",
      documentIds: ["test-pack-aaaaaaaaaaaa"],
      chunkIds: [],
      mode: "mock",
      repairAttempts: 0
    },
    validationMetadata: null,
    reviewMetadata: { revision: 1 },
    history: [],
    createdAt: "2026-08-05T10:00:00.000Z",
    updatedAt: "2026-08-05T10:00:00.000Z",
    ...flashcardPayload()
  } as ContentDraft;
}

describe("machine à états éditoriale", () => {
  it("n'a pas d'état « published » — la publication est structurellement impossible", () => {
    expect(contentDraftStatuses).not.toContain("published");
    for (const targets of Object.values(allowedTransitions)) {
      expect(targets).not.toContain("published");
    }
  });

  it("autorise le chemin nominal de la génération à l'approbation", () => {
    expect(canTransition("draft", "needs_review")).toBe(true);
    expect(canTransition("needs_review", "approved")).toBe(true);
  });

  it("autorise l'échec des contrôles et sa reprise", () => {
    expect(canTransition("draft", "validation_failed")).toBe(true);
    expect(canTransition("validation_failed", "draft")).toBe(true);
  });

  it("autorise le rejet et sa reprise", () => {
    expect(canTransition("needs_review", "rejected")).toBe(true);
    expect(canTransition("rejected", "draft")).toBe(true);
  });

  it("interdit les raccourcis vers l'approbation", () => {
    expect(canTransition("draft", "approved")).toBe(false);
    expect(canTransition("validation_failed", "approved")).toBe(false);
    expect(canTransition("validation_failed", "needs_review")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("fait de « approved » un état terminal : rien ne l'écrase", () => {
    expect(isTerminal("approved")).toBe(true);
    for (const status of contentDraftStatuses) {
      expect(canTransition("approved", status)).toBe(false);
    }
  });

  it("refuse une transition vers soi-même", () => {
    for (const status of contentDraftStatuses) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it("lève une erreur explicite sur une transition interdite", () => {
    expect(() => assertTransition("validation_failed", "approved")).toThrow(InvalidTransitionError);
    expect(() => assertTransition("draft", "approved")).toThrow(/Transition interdite/);
  });

  it("inscrit chaque transition dans l'historique avec son acteur", () => {
    const draft = draftAt("needs_review");
    const approved = applyTransition({
      draft,
      to: "approved",
      actor: "relecteur@example.test",
      comment: "Vérifié contre la fiche de cours.",
      occurredAt: "2026-08-05T12:00:00.000Z"
    });

    expect(approved.status).toBe("approved");
    expect(approved.history).toHaveLength(1);
    expect(approved.history[0]).toMatchObject({
      fromStatus: "needs_review",
      toStatus: "approved",
      actor: "relecteur@example.test",
      comment: "Vérifié contre la fiche de cours."
    });
    expect(approved.reviewMetadata.reviewedBy).toBe("relecteur@example.test");
  });

  it("sort un contenu réparé de l'impasse validation_failed", () => {
    // Sans cela, corriger un contenu en échec le laissait inapprouvable : la
    // seule sortie légale de validation_failed est draft, et rien ne remontait
    // ensuite vers needs_review.
    const repaired = advanceAfterValidation(
      draftAt("validation_failed"),
      true,
      "2026-08-05T12:00:00.000Z",
      "validator"
    );

    expect(repaired.status).toBe("needs_review");
    expect(repaired.history.map((entry) => entry.toStatus)).toEqual(["draft", "needs_review"]);
  });

  it("fait basculer un brouillon en échec vers validation_failed avec son motif", () => {
    const failed = advanceAfterValidation(
      draftAt("draft"),
      false,
      "2026-08-05T12:00:00.000Z",
      "validator",
      "resultat-divergent"
    );

    expect(failed.status).toBe("validation_failed");
    expect(failed.history[0].comment).toBe("resultat-divergent");
  });

  it("ne rétrograde pas un contenu déjà en revue, ni ne touche aux états humains", () => {
    const now = "2026-08-05T12:00:00.000Z";

    // needs_review → validation_failed n'est pas une transition légale :
    // c'est l'approbation qui refusera après revalidation.
    expect(advanceAfterValidation(draftAt("needs_review"), false, now, "validator").status).toBe(
      "needs_review"
    );
    expect(advanceAfterValidation(draftAt("approved"), false, now, "validator").status).toBe("approved");
    expect(advanceAfterValidation(draftAt("rejected"), true, now, "validator").status).toBe("rejected");
  });

  it("refuse d'appliquer une transition interdite même via applyTransition", () => {
    expect(() =>
      applyTransition({
        draft: draftAt("validation_failed"),
        to: "approved",
        actor: "relecteur@example.test",
        occurredAt: "2026-08-05T12:00:00.000Z"
      })
    ).toThrow(InvalidTransitionError);
  });
});
