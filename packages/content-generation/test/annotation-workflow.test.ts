import { describe, expect, it } from "vitest";
import {
  AnnotationDecisionRefusedError,
  InvalidAnnotationTransitionError,
  UnreliableTextSourceError,
  applyAnnotationTransition,
  assertTextChunkUsable,
  canTransitionAnnotation,
  correctAnnotation,
  indexUsability,
  requiresApprovedAnnotation,
  usabilityOf,
  visualAnnotationSchema,
  type VisualAnnotation
} from "../src/index";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const NOW = "2026-08-10T12:00:00.000Z";

function annotation(overrides: Partial<VisualAnnotation> = {}): VisualAnnotation {
  return visualAnnotationSchema.parse({
    annotationId: "titres-p03-region-1",
    documentId: "compta-approfondie-a107fa5e7be4",
    pageNumber: 3,
    pageImageHash: HASH_A,
    regionId: "region-1",
    annotationType: "bank_notice",
    expectedInformation: "avis de débit",
    transcription: "Avis de débit n° 815603",
    structuredFacts: [],
    confidence: "high",
    transcriptionMethod: "visual",
    reviewStatus: "needs_human_review",
    priority: "BLOCKING",
    warnings: [],
    createdAt: NOW,
    ...overrides
  });
}

describe("machine à états", () => {
  it("autorise exactement les transitions prévues", () => {
    expect(canTransitionAnnotation("draft", "needs_human_review")).toBe(true);
    expect(canTransitionAnnotation("needs_human_review", "approved")).toBe(true);
    expect(canTransitionAnnotation("needs_human_review", "rejected")).toBe(true);
    expect(canTransitionAnnotation("rejected", "needs_human_review")).toBe(true);
  });

  it("traite approved comme un état signé, sans sortie", () => {
    expect(canTransitionAnnotation("approved", "needs_human_review")).toBe(false);
    expect(canTransitionAnnotation("approved", "rejected")).toBe(false);

    expect(() =>
      applyAnnotationTransition({
        annotation: annotation({ reviewStatus: "approved" }),
        to: "needs_human_review",
        actor: "installation-locale",
        occurredAt: NOW
      })
    ).toThrowError(InvalidAnnotationTransitionError);
  });

  it("refuse de sauter de draft à approved", () => {
    expect(() =>
      applyAnnotationTransition({
        annotation: annotation({ reviewStatus: "draft" }),
        to: "approved",
        actor: "installation-locale",
        occurredAt: NOW,
        renderedImageHash: HASH_A
      })
    ).toThrowError(InvalidAnnotationTransitionError);
  });
});

describe("approbation", () => {
  it("enregistre acteur, date et empreinte vue", () => {
    const approved = applyAnnotationTransition({
      annotation: annotation(),
      to: "approved",
      actor: "installation-locale",
      occurredAt: NOW,
      renderedImageHash: HASH_A
    });

    expect(approved.reviewStatus).toBe("approved");
    expect(approved.reviewedBy).toBe("installation-locale");
    expect(approved.reviewedAt).toBe(NOW);
    expect(approved.reviewedImageHash).toBe(HASH_A);
  });

  it("refuse une annotation sans empreinte de rendu", () => {
    expect(() =>
      applyAnnotationTransition({
        annotation: annotation({ pageImageHash: null }),
        to: "approved",
        actor: "installation-locale",
        occurredAt: NOW,
        renderedImageHash: HASH_A
      })
    ).toThrowError(/aucune empreinte/);
  });

  it("refuse quand le rendu est introuvable : ne pas pouvoir vérifier n'est pas vérifier", () => {
    expect(() =>
      applyAnnotationTransition({
        annotation: annotation(),
        to: "approved",
        actor: "installation-locale",
        occurredAt: NOW
      })
    ).toThrowError(/introuvable/);
  });

  it("refuse quand la source visuelle a changé", () => {
    try {
      applyAnnotationTransition({
        annotation: annotation(),
        to: "approved",
        actor: "installation-locale",
        occurredAt: NOW,
        renderedImageHash: HASH_B
      });
      expect.unreachable("l'approbation aurait dû être refusée");
    } catch (error) {
      expect((error as AnnotationDecisionRefusedError).code).toBe("visual-source-annotation-stale-image");
    }
  });
});

describe("rejet", () => {
  it("exige un motif d'au moins dix caractères", () => {
    expect(() =>
      applyAnnotationTransition({
        annotation: annotation(),
        to: "rejected",
        actor: "installation-locale",
        occurredAt: NOW,
        reason: "faux"
      })
    ).toThrowError(/motif/);
  });

  it("enregistre le motif quand il est fourni", () => {
    const rejected = applyAnnotationTransition({
      annotation: annotation(),
      to: "rejected",
      actor: "installation-locale",
      occurredAt: NOW,
      reason: "Le montant de la ligne 2 ne correspond pas à l'image."
    });

    expect(rejected.reviewStatus).toBe("rejected");
    expect(rejected.reviewReason).toContain("ne correspond pas");
  });
});

describe("correction avant décision", () => {
  it("modifie la transcription sans toucher à la source", () => {
    const corrected = correctAnnotation(annotation(), {
      transcription: "Avis de débit n° 815603 — corrigé",
      confidence: "medium"
    });

    expect(corrected.transcription).toContain("corrigé");
    expect(corrected.confidence).toBe("medium");
    expect(corrected.pageImageHash).toBe(HASH_A);
    expect(corrected.pageNumber).toBe(3);
  });

  it("refuse de corriger une annotation signée", () => {
    expect(() =>
      correctAnnotation(annotation({ reviewStatus: "approved" }), { transcription: "autre" })
    ).toThrowError(InvalidAnnotationTransitionError);
  });
});

describe("champs propres au type d'annotation", () => {
  it("conserve un arbre de décision que le schéma ne connaît pas", () => {
    const withTree = visualAnnotationSchema.parse({
      ...annotation(),
      decisionTree: { nodes: [{ id: "d1", label: "Possession durable ?" }], edges: [] }
    });

    expect(withTree).toHaveProperty("decisionTree");

    const approved = applyAnnotationTransition({
      annotation: withTree,
      to: "approved",
      actor: "installation-locale",
      occurredAt: NOW,
      renderedImageHash: HASH_A
    });

    expect(approved).toHaveProperty("decisionTree");
  });
});

describe("fiabilité du texte d'une page", () => {
  const map = indexUsability({
    pack: "compta-approfondie",
    pages: [
      {
        documentId: "compta-approfondie-a107fa5e7be4",
        pageNumber: 9,
        usability: "visual_required",
        reason: "la couche texte porte un corrigé que la page n'affiche pas"
      },
      {
        documentId: "compta-approfondie-a107fa5e7be4",
        pageNumber: 4,
        usability: "mixed",
        reason: "les questions sont lisibles, les données de l'opération sont en image"
      }
    ]
  });

  it("classe une page absente comme fiable", () => {
    expect(usabilityOf(map, "compta-approfondie-a107fa5e7be4", 2)).toBe("reliable");
    expect(() => assertTextChunkUsable(map, "compta-approfondie-a107fa5e7be4", 2)).not.toThrow();
  });

  it("refuse le texte d'une page dont la couche ment", () => {
    expect(() => assertTextChunkUsable(map, "compta-approfondie-a107fa5e7be4", 9)).toThrowError(
      UnreliableTextSourceError
    );
  });

  it("traite mixed comme exigeant une annotation approuvée, sans échappatoire", () => {
    expect(requiresApprovedAnnotation("mixed")).toBe(true);
    expect(requiresApprovedAnnotation("visual_required")).toBe(true);
    expect(requiresApprovedAnnotation("unusable")).toBe(true);
    expect(requiresApprovedAnnotation("reliable")).toBe(false);
    expect(() => assertTextChunkUsable(map, "compta-approfondie-a107fa5e7be4", 4)).toThrowError(
      UnreliableTextSourceError
    );
  });
});
