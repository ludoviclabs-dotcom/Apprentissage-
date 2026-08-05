import { describe, expect, it } from "vitest";
import { sourceReferenceSchema, verifyReference, verifyReferences } from "../src";
import {
  CHUNK_ACCOUNTS,
  CHUNK_DATA,
  CHUNK_RULES,
  COURSE_DOC_ID,
  EXERCISE_DOC_ID,
  testCorpus,
  validReference
} from "./fixtures";

describe("références de source — forme", () => {
  it("refuse une page inférieure à 1", () => {
    const parsed = sourceReferenceSchema.safeParse({ ...validReference, pageStart: 0, pageEnd: 0 });
    expect(parsed.success).toBe(false);
  });

  it("refuse un intervalle de pages décroissant", () => {
    const parsed = sourceReferenceSchema.safeParse({ ...validReference, pageStart: 3, pageEnd: 2 });
    expect(parsed.success).toBe(false);
  });

  it("refuse une référence sans chunk", () => {
    const parsed = sourceReferenceSchema.safeParse({ ...validReference, chunkIds: [] });
    expect(parsed.success).toBe(false);
  });
});

describe("références de source — vérification contre le corpus", () => {
  it("accepte une référence exacte", () => {
    const result = verifyReference(sourceReferenceSchema.parse(validReference), testCorpus);
    expect(result.valid).toBe(true);
    expect(result.problems).toHaveLength(0);
  });

  it("refuse un document inexistant", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({ ...validReference, documentId: "pack-inexistant" }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems[0].code).toBe("document-inconnu");
  });

  it("refuse une page qui n'appartient pas au document", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({ ...validReference, pageStart: 9, pageEnd: 9 }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.code === "page-inexistante")).toBe(true);
  });

  it("refuse un chunk appartenant à un autre document", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({ ...validReference, chunkIds: [CHUNK_DATA] }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.code === "chunk-inconnu")).toBe(true);
  });

  it("refuse un chunk hors de l'intervalle de pages cité", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({
        pack: "test-pack",
        documentId: COURSE_DOC_ID,
        documentTitle: "Les emprunts obligataires - Fiche de cours",
        sourceType: "course",
        pageStart: 1,
        pageEnd: 1,
        chunkIds: [CHUNK_ACCOUNTS]
      }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.code === "chunk-hors-intervalle")).toBe(true);
  });

  it("refuse un extrait dont le hash ne correspond plus à la source", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({ ...validReference, excerptHash: "f".repeat(64) }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.code === "hash-divergent")).toBe(true);
  });

  it("accepte une référence couvrant plusieurs chunks d'un même document", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({
        pack: "test-pack",
        documentId: COURSE_DOC_ID,
        documentTitle: "Les emprunts obligataires - Fiche de cours",
        sourceType: "course",
        pageStart: 1,
        pageEnd: 2,
        chunkIds: [CHUNK_RULES, CHUNK_ACCOUNTS],
        // L'extrait ne provient que d'un des deux fragments : c'est le cas normal.
        excerptHash: "a".repeat(64)
      }),
      testCorpus
    );

    expect(result.valid).toBe(true);
  });

  it("signale une page dégradée sans invalider la référence", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({
        pack: "test-pack",
        documentId: COURSE_DOC_ID,
        documentTitle: "Les emprunts obligataires - Fiche de cours",
        sourceType: "course",
        pageStart: 3,
        pageEnd: 3,
        chunkIds: [CHUNK_ACCOUNTS]
      }),
      testCorpus
    );

    // La page 3 est dégradée : avertissement. Le chunk est hors intervalle :
    // c'est cela, et cela seul, qui invalide.
    expect(result.warnings.some((problem) => problem.code === "page-degradee")).toBe(true);
  });

  it("refuse une référence qui annonce un autre pack", () => {
    const result = verifyReference(
      sourceReferenceSchema.parse({ ...validReference, pack: "autre-pack" }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.code === "pack-divergent")).toBe(true);
  });

  it("refuse qu'un support de cours soit présenté comme une référence officielle", () => {
    // AGENTS.md : cours et référentiel ne se mélangent pas sans le dire.
    const result = verifyReference(
      sourceReferenceSchema.parse({ ...validReference, sourceType: "official-reference" }),
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.some((problem) => problem.code === "nature-divergente")).toBe(true);
  });

  it("exige pack et nature dès le schéma", () => {
    const { pack: _pack, ...withoutPack } = validReference;
    const { sourceType: _kind, ...withoutKind } = validReference;

    expect(sourceReferenceSchema.safeParse(withoutPack).success).toBe(false);
    expect(sourceReferenceSchema.safeParse(withoutKind).success).toBe(false);
  });

  it("agrège les problèmes de plusieurs références", () => {
    const result = verifyReferences(
      [
        sourceReferenceSchema.parse(validReference),
        sourceReferenceSchema.parse({ ...validReference, documentId: EXERCISE_DOC_ID })
      ],
      testCorpus
    );

    expect(result.valid).toBe(false);
    expect(result.problems.length).toBeGreaterThan(0);
  });
});
