import { describe, expect, it } from "vitest";
import {
  generationModeSchema,
  generationModes,
  isPublishableGenerationMode,
  publishableGenerationModeSchema,
  publishableGenerationModes
} from "../src/types/generation-mode";
import { generationMetadataSchema } from "../src/types/metadata";

/**
 * Le contrat des modes de génération, éprouvé sur sa source de vérité.
 *
 * DEUX QUESTIONS DISTINCTES, DEUX OUTILS DISTINCTS. « Cette valeur est-elle un
 * mode connu ? » est une question de désérialisation, et c'est
 * `generationModeSchema` qui y répond. « Ce mode peut-il être publié ? » est une
 * question de politique éditoriale, et c'est `isPublishableGenerationMode` qui y
 * répond. Les avoir confondues est ce qui avait rendu un contenu
 * `manual-assisted` approuvé *illisible* — une exception Zod — au lieu de le
 * rendre publiable, ce qu'il était.
 */

describe("modes connus", () => {
  it("désérialise le mode mock", () => {
    expect(generationModeSchema.parse("mock")).toBe("mock");
  });

  it("désérialise le mode live", () => {
    expect(generationModeSchema.parse("live")).toBe("live");
  });

  it("désérialise le mode manual-assisted", () => {
    expect(generationModeSchema.parse("manual-assisted")).toBe("manual-assisted");
  });

  it("refuse un mode inconnu", () => {
    expect(generationModeSchema.safeParse("mode-invente").success).toBe(false);
    expect(generationModeSchema.safeParse("").success).toBe(false);
  });

  it("énumère exactement les trois provenances du système", () => {
    expect([...generationModes]).toEqual(["mock", "live", "manual-assisted"]);
  });

  it("est le schéma qu'emploient les métadonnées d'un brouillon", () => {
    // Si les deux divergeaient, un brouillon assisté serait relisible et son
    // instantané ne le serait pas — ce qui est exactement le défaut corrigé.
    for (const mode of generationModes) {
      expect(
        generationMetadataSchema.safeParse({
          provider: "manuel",
          model: "manual-assisted:auteur:0123456789ab",
          promptId: "flashcard-atomic",
          promptVersion: "v1",
          generatedAt: "2026-08-08T12:00:00.000Z",
          inputHash: "a".repeat(64),
          sourcePackId: "pack-test",
          documentIds: ["doc-1"],
          chunkIds: [],
          mode
        }).success
      ).toBe(true);
    }
  });
});

describe("liste blanche de publication", () => {
  it("accepte live", () => {
    expect(isPublishableGenerationMode("live")).toBe(true);
    expect(publishableGenerationModeSchema.parse("live")).toBe("live");
  });

  it("accepte manual-assisted", () => {
    expect(isPublishableGenerationMode("manual-assisted")).toBe(true);
    expect(publishableGenerationModeSchema.parse("manual-assisted")).toBe("manual-assisted");
  });

  it("refuse mock, qui reste un mode connu", () => {
    // Connu et impubliable : le mock se relit, s'audite, se compte — il ne se
    // publie pas. La première propriété est ce qui permet à un audit de
    // constater sur pièce d'où vient une version.
    expect(generationModeSchema.safeParse("mock").success).toBe(true);
    expect(isPublishableGenerationMode("mock")).toBe(false);
    expect(publishableGenerationModeSchema.safeParse("mock").success).toBe(false);
  });

  it("refuse par défaut tout mode inconnu", () => {
    for (const candidate of ["", "MOCK", "Live", "manual", "manual_assisted", "mode-futur"]) {
      expect(isPublishableGenerationMode(candidate)).toBe(false);
    }
  });

  it("n'admet aucun mode qui ne soit pas d'abord un mode connu", () => {
    // La liste blanche est un sous-ensemble, pas une seconde énumération : sans
    // cette contrainte, elle pourrait autoriser un mode que rien ne produit.
    for (const mode of publishableGenerationModes) {
      expect(generationModes as readonly string[]).toContain(mode);
    }

    expect([...publishableGenerationModes]).toEqual(["live", "manual-assisted"]);
  });
});
