import { describe, expect, it } from "vitest";
import {
  VISUAL_ANNOTATION_NOT_APPROVED,
  VISUAL_ANNOTATION_STALE_IMAGE,
  VisualAnnotationNotApprovedError,
  VisualAnnotationStaleImageError,
  approvedAnnotations,
  factsOf,
  pageImageHash,
  requireApprovedAnnotations,
  visualAnnotationPlanSchema,
  type VisualAnnotation,
  type VisualAnnotationPlan
} from "../src/index";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function annotation(overrides: Partial<VisualAnnotation> = {}): VisualAnnotation {
  return {
    annotationId: "titres-p03-region-1",
    documentId: "compta-approfondie-a107fa5e7be4",
    pageNumber: 3,
    pageImageHash: HASH_A,
    regionId: "region-1",
    annotationType: "bank_notice",
    expectedInformation: "avis de débit",
    transcription: "Avis de débit n° 815603",
    structuredFacts: [
      {
        factId: "net",
        label: "Net à votre débit",
        value: 30720,
        unit: "EUR",
        context: "ligne de total",
        sourceRegion: "tableau",
        confidence: "high"
      }
    ],
    confidence: "high",
    transcriptionMethod: "visual",
    reviewStatus: "needs_human_review",
    priority: "BLOCKING",
    warnings: [],
    createdAt: "2026-08-10T00:00:00.000Z",
    ...overrides
  };
}

function plan(...annotations: VisualAnnotation[]): VisualAnnotationPlan {
  return { chapter: "les-titres", imageDirectory: "data/generated/visual/titres", annotations };
}

describe("empreinte de rendu", () => {
  it("scelle l'image, et change dès qu'un octet change", () => {
    const first = pageImageHash(new Uint8Array([1, 2, 3]));
    const second = pageImageHash(new Uint8Array([1, 2, 4]));

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
  });
});

describe("schéma", () => {
  it("refuse une empreinte qui n'est pas un SHA-256", () => {
    const parsed = visualAnnotationPlanSchema.safeParse(plan(annotation({ pageImageHash: "trop-court" })));

    expect(parsed.success).toBe(false);
  });

  it("accepte une empreinte absente : une page non rendue reste décrivable", () => {
    const parsed = visualAnnotationPlanSchema.safeParse(plan(annotation({ pageImageHash: null })));

    expect(parsed.success).toBe(true);
  });

  it("n'admet pas de méthode de transcription « approuvée par OCR »", () => {
    const parsed = visualAnnotationPlanSchema.safeParse(
      plan(annotation({ transcriptionMethod: "ocr-approved" as never }))
    );

    expect(parsed.success).toBe(false);
  });
});

describe("filtre des annotations utilisables", () => {
  it("ne retient que les approuvées", () => {
    const usable = approvedAnnotations(
      plan(
        annotation({ annotationId: "brouillon", reviewStatus: "needs_human_review" }),
        annotation({ annotationId: "rejetee", reviewStatus: "rejected" }),
        annotation({ annotationId: "approuvee", reviewStatus: "approved" })
      )
    );

    expect(usable.map((entry) => entry.annotationId)).toEqual(["approuvee"]);
  });

  it("ne retient rien quand tout est en attente de revue", () => {
    expect(approvedAnnotations(plan(annotation(), annotation({ annotationId: "autre" })))).toEqual([]);
  });
});

describe("exigence d'annotation approuvée", () => {
  const requirement = { documentId: "compta-approfondie-a107fa5e7be4", pageNumber: 3 };

  it("refuse une annotation en attente de revue humaine", () => {
    expect(() => requireApprovedAnnotations(plan(annotation()), [requirement])).toThrowError(
      VisualAnnotationNotApprovedError
    );

    try {
      requireApprovedAnnotations(plan(annotation()), [requirement]);
    } catch (error) {
      expect((error as VisualAnnotationNotApprovedError).code).toBe(VISUAL_ANNOTATION_NOT_APPROVED);
      expect((error as VisualAnnotationNotApprovedError).reviewStatus).toBe("needs_human_review");
    }
  });

  it("refuse une annotation rejetée", () => {
    expect(() =>
      requireApprovedAnnotations(plan(annotation({ reviewStatus: "rejected" })), [requirement])
    ).toThrowError(VisualAnnotationNotApprovedError);
  });

  it("refuse une exigence qu'aucune annotation ne couvre", () => {
    expect(() =>
      requireApprovedAnnotations(plan(annotation({ reviewStatus: "approved" })), [
        { documentId: "compta-approfondie-a107fa5e7be4", pageNumber: 9 }
      ])
    ).toThrowError(VisualAnnotationNotApprovedError);
  });

  it("accepte une annotation approuvée", () => {
    const resolved = requireApprovedAnnotations(plan(annotation({ reviewStatus: "approved" })), [requirement]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].reviewStatus).toBe("approved");
  });

  it("refuse dès qu'UNE seule exigence n'est pas satisfaite, sans rien rendre de partiel", () => {
    const both = plan(
      annotation({ reviewStatus: "approved" }),
      annotation({ annotationId: "p09", pageNumber: 9, reviewStatus: "needs_human_review" })
    );

    expect(() =>
      requireApprovedAnnotations(both, [requirement, { documentId: requirement.documentId, pageNumber: 9 }])
    ).toThrowError(VisualAnnotationNotApprovedError);
  });
});

describe("invalidation par changement de rendu", () => {
  const requirement = { documentId: "compta-approfondie-a107fa5e7be4", pageNumber: 3 };

  it("refuse une annotation approuvée dont le rendu a changé", () => {
    const rendered = new Map([["compta-approfondie-a107fa5e7be4:3", HASH_B]]);

    expect(() =>
      requireApprovedAnnotations(plan(annotation({ reviewStatus: "approved" })), [requirement], rendered)
    ).toThrowError(VisualAnnotationStaleImageError);

    try {
      requireApprovedAnnotations(plan(annotation({ reviewStatus: "approved" })), [requirement], rendered);
    } catch (error) {
      expect((error as VisualAnnotationStaleImageError).code).toBe(VISUAL_ANNOTATION_STALE_IMAGE);
    }
  });

  it("accepte quand le rendu est resté le même", () => {
    const rendered = new Map([["compta-approfondie-a107fa5e7be4:3", HASH_A]]);

    expect(
      requireApprovedAnnotations(plan(annotation({ reviewStatus: "approved" })), [requirement], rendered)
    ).toHaveLength(1);
  });

  it("ne contrôle rien quand aucun rendu n'est fourni : l'absence de preuve n'est pas une divergence", () => {
    expect(
      requireApprovedAnnotations(plan(annotation({ reviewStatus: "approved" })), [requirement])
    ).toHaveLength(1);
  });
});

describe("provenance des faits", () => {
  it("attache à chaque fait son annotation, sa page et son empreinte", () => {
    const facts = factsOf([annotation({ reviewStatus: "approved" })]);

    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      factId: "net",
      annotationId: "titres-p03-region-1",
      pageNumber: 3,
      pageImageHash: HASH_A
    });
  });

  it("ne porte aucun chemin de fichier privé", () => {
    const serialised = JSON.stringify(factsOf([annotation({ reviewStatus: "approved" })]));

    expect(serialised).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(serialised).not.toMatch(/dropbox|content-private|data\/extracted/i);
  });
});

describe("tableau resté ambigu", () => {
  it("conserve l'ambiguïté au lieu de la combler", () => {
    // Une ligne vide reste vide : le contrat est que rien n'est inventé, et le
    // seul moyen de le vérifier est qu'aucune cellule n'apparaisse.
    const ambiguous = annotation({
      annotationId: "titres-p09-region-1",
      pageNumber: 9,
      annotationType: "table",
      reviewStatus: "approved",
      structuredFacts: [],
      warnings: ["structuralAmbiguity = true : les lignes sont vides, aucune cellule n'est inventée."]
    });

    const resolved = requireApprovedAnnotations(plan(ambiguous), [
      { documentId: ambiguous.documentId, pageNumber: 9 }
    ]);

    expect(factsOf(resolved)).toEqual([]);
    expect(resolved[0].warnings.join(" ")).toContain("aucune cellule n'est inventée");
  });
});
