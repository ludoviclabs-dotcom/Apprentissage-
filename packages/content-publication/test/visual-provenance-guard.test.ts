import { describe, expect, it } from "vitest";
import { inspectForPublication } from "../src/guard";
import {
  approvedAnnotation,
  changedRenderedImages,
  currentRenderedImages,
  degradedReference,
  draftFor,
  pendingAnnotation,
  sheetContent,
  staleAnnotation,
  testCorpus,
  unbackedRasterReference,
  visualBackedReference
} from "./fixtures";
import type { ContentPayload } from "@finance/content-generation";

/**
 * Une page dégradée n'est pas une page interdite : c'est une page dont le texte
 * extrait ne fait pas foi.
 *
 * TOUT TIENT DANS CETTE DISTINCTION, et elle est générique — elle se lit sur la
 * référence, pas sur un chapitre. Citer le texte d'une telle page reste refusé,
 * parce que ce texte peut porter autre chose que ce que la page affiche. S'y
 * appuyer par une transcription qu'une personne a confrontée à l'image et
 * signée est autorisé, parce que c'est alors la page elle-même qu'on cite.
 *
 * Le refuser aussi aurait rendu inutile tout le travail d'annotation : les
 * seules pages qui *ont besoin* d'une transcription sont précisément celles
 * dont l'extraction est dégradée.
 */

function inspect(
  references: unknown[],
  options: Parameters<typeof inspectForPublication>[0] extends infer T
    ? T extends { draft: unknown }
      ? Omit<T, "draft" | "corpus" | "currentVersion">
      : never
    : never = {}
) {
  return inspectForPublication({
    draft: draftFor(
      {
        contentType: "smart_revision_sheet",
        content: sheetContent({ sourceReferences: references })
      } as ContentPayload,
      { status: "approved" }
    ),
    corpus: testCorpus,
    currentVersion: 0,
    ...options
  });
}

function codes(report: ReturnType<typeof inspectForPublication>): string[] {
  return report.errors.map((issue) => issue.code);
}

describe("garde de publication — texte extrait d'une page dégradée", () => {
  it("refuse une référence dont un fragment cité provient de la page dégradée", () => {
    const report = inspect([degradedReference], { visualAnnotations: [approvedAnnotation] });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("page-degradee");
  });

  it("refuse une page dégradée qui n'invoque aucune provenance visuelle", () => {
    const report = inspect([unbackedRasterReference], { visualAnnotations: [approvedAnnotation] });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("page-degradee");
  });
});

describe("garde de publication — source visuelle approuvée", () => {
  it("accepte une page dégradée couverte par une annotation approuvée", () => {
    const report = inspect([visualBackedReference], { visualAnnotations: [approvedAnnotation] });

    expect(report.errors).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it("accepte encore quand le rendu courant confirme l'empreinte signée", () => {
    const report = inspect([visualBackedReference], {
      visualAnnotations: [approvedAnnotation],
      renderedImageHashes: currentRenderedImages
    });

    expect(report.passed).toBe(true);
  });

  it("refuse une annotation approuvée dont le rendu a changé depuis la signature", () => {
    const report = inspect([visualBackedReference], {
      visualAnnotations: [approvedAnnotation],
      renderedImageHashes: changedRenderedImages
    });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("visual-source-annotation-stale-image");
  });

  it("refuse une annotation signée sur un rendu qui n'est pas celui qu'elle décrit", () => {
    // L'obsolescence se constate sans image : la signature et la transcription
    // ne portent pas sur le même rendu, et l'annotation se contredit.
    const report = inspect([visualBackedReference], { visualAnnotations: [staleAnnotation] });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("visual-source-annotation-stale-image");
  });

  it("refuse une annotation transcrite mais jamais signée", () => {
    const report = inspect([visualBackedReference], { visualAnnotations: [pendingAnnotation] });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("visual-source-annotation-not-approved");
  });

  it("refuse une annotation que le magasin ne connaît pas", () => {
    const report = inspect([visualBackedReference], { visualAnnotations: [] });

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("visual-source-annotation-unknown");
  });

  it("refuse quand aucun magasin d'annotations n'est fourni", () => {
    // Ne pas pouvoir vérifier n'est pas vérifier : le refus est la seule
    // réponse qui ne se confonde pas avec un succès.
    const report = inspect([visualBackedReference]);

    expect(report.passed).toBe(false);
    expect(codes(report)).toContain("visual-source-annotation-unverifiable");
  });
});
