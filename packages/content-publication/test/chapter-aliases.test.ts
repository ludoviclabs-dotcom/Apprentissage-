import { describe, expect, it } from "vitest";
import { publishedContentVersionSchema } from "../src/types";
import { buildPublishedVersion, UnknownChapterError } from "../src/snapshot";
import { resolvePublicChapter } from "../src/taxonomy";
import {
  normativeContextOf,
  toPublicCalculationExercise,
  toPublicFlashcardFront,
  toPublicSourceReferences
} from "../src/public/projection";
import { draftFor, calculationContent, sheetContent } from "./fixtures";
import type { ContentPayload } from "@finance/content-generation";

/**
 * Un chapitre du programme doit pouvoir être publié quel que soit le nom du
 * fichier dont il a été extrait.
 *
 * LE DÉFAUT SE VOYAIT UNE ÉTAPE TROP TARD. Le garde de publication acceptait
 * ces contenus — sources vérifiées, référentiel nommé, contrôles déterministes
 * verts — et la construction de l'instantané les refusait ensuite pour un
 * chapitre « hors programme » qui figure pourtant dans la taxonomie. Le seul
 * écart était le slug : `detectChapter` le dérive du nom du PDF, la table
 * publique déclarait l'autre forme.
 *
 * Ces tests couvrent le chemin complet — résolution, instantané, schéma, DTO —
 * parce que c'est l'enchaînement qui cassait, et non l'une de ses étapes.
 */

const SOURCE_CHAPTERS = [
  ["les-titres", "titres", "Titres"],
  ["les-contrats-a-long-terme", "contrats-a-long-terme", "Contrats à long terme"],
  ["la-constitution-des-entreprises", "constitution-des-societes", "Constitution des sociétés"],
  ["les-variations-du-capital-des-societes", "variations-du-capital", "Variations du capital"],
  ["les-emprunts-obligataires", "emprunts-obligataires", "Emprunts obligataires"]
] as const;

function snapshotOf(chapterSlug: string, payload: ContentPayload) {
  return buildPublishedVersion({
    draft: draftFor(payload, { status: "approved", chapterSlug }),
    publishedBy: "test",
    publishedAt: "2026-08-11T00:00:00.000Z",
    publicationVersion: 1,
    previousPublishedVersionId: null
  });
}

describe("alias de chapitre — résolution", () => {
  it.each(SOURCE_CHAPTERS)("« %s » alimente le chapitre public « %s »", (source, slug, label) => {
    const chapter = resolvePublicChapter(source);

    expect(chapter?.slug).toBe(slug);
    expect(chapter?.label).toBe(label);
  });

  it.each(SOURCE_CHAPTERS)("le slug public « %s » reste résolu par lui-même", (_source, slug) => {
    expect(resolvePublicChapter(slug)?.slug).toBe(slug);
  });
});

describe("alias de chapitre — instantané et DTO", () => {
  it.each(SOURCE_CHAPTERS)("construit un instantané pour un contenu de « %s »", (source, slug) => {
    const version = snapshotOf(source, {
      contentType: "smart_revision_sheet",
      content: sheetContent()
    } as ContentPayload);

    // L'instantané porte le slug PUBLIC : c'est lui qui nomme l'URL, et le slug
    // du corpus n'a pas à traverser cette frontière.
    expect(version.chapter).toBe(slug);
    expect(publishedContentVersionSchema.parse(version)).toBeTruthy();
    expect(normativeContextOf(version).scoringPolicy).toBe("graded");
    expect(toPublicSourceReferences(version.sourceReferencesSnapshot).length).toBeGreaterThan(0);
  });

  it("projette une carte d'un chapitre généralisé sans exposer sa réponse", () => {
    const version = snapshotOf("les-titres", {
      contentType: "flashcard",
      content: {
        type: "concept",
        front: "À quoi reconnaît-on une valeur mobilière de placement ?",
        back: "À l'intention de la céder à brève échéance.",
        explanation: "Le critère est l'intention de détention, pas la nature du titre.",
        learningObjective: "Distinguer un placement d'une immobilisation financière.",
        sourceReferences: sheetContent().sourceReferences,
        difficulty: 2,
        tags: ["cg-titres-vmp"],
        relatedConceptIds: [],
        atomicityCheck: { testedFactCount: 1, singleFocus: true, justification: "Une seule connaissance." }
      }
    } as ContentPayload);

    const front = toPublicFlashcardFront(version);

    expect(version.chapter).toBe("titres");
    expect(JSON.stringify(front)).not.toContain("brève échéance");
  });

  it("projette un calcul d'un chapitre généralisé", () => {
    const version = snapshotOf("les-variations-du-capital-des-societes", {
      contentType: "calculation_exercise",
      content: calculationContent()
    } as ContentPayload);

    expect(version.chapter).toBe("variations-du-capital");
    expect(toPublicCalculationExercise(version).statement.length).toBeGreaterThan(0);
  });

  it("refuse toujours un chapitre qui n'est pas au programme", () => {
    expect(() =>
      snapshotOf("chapitre-invente", {
        contentType: "smart_revision_sheet",
        content: sheetContent()
      } as ContentPayload)
    ).toThrow(UnknownChapterError);
  });
});
