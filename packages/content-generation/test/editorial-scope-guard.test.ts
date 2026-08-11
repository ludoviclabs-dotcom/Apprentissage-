import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED_EDITORIAL_SCOPE_CONSUMED,
  EditorialScopeInvalidError,
  ExcludedEditorialScopeError,
  assertReferencesWithinScope,
  buildSourceEnvelope,
  editorialScopeFileName,
  editorialScopeSchema,
  findScopeViolation,
  isWithinScope,
  loadChapterEditorialScope,
  type CorpusDocument,
  type CorpusIndex,
  type EditorialScopeExclusion
} from "../src/index";

/**
 * Une source peut être fiable et pourtant hors sujet.
 *
 * C'est exactement le cas que ces tests reproduisent : une page dont
 * l'extraction est exacte, dont les chunks sont valides, et qui appartient
 * néanmoins à un cas écarté de cette version du chapitre.
 */

const DOC = "doc-cas";

function corpus(): CorpusIndex {
  const document = {
    documentId: DOC,
    packId: "pack",
    title: "Support",
    category: "course",
    domainId: "compta-generale",
    chapterSlug: "chapitre-test",
    chapterLabel: "Chapitre test",
    pages: [
      { pageNumber: 1, degraded: false },
      { pageNumber: 8, degraded: false }
    ],
    chunks: [
      { id: "c-hors-cas", documentId: DOC, pageStart: 1, pageEnd: 1, contentHash: "h1", content: "règle générale", sectionTitle: "S" },
      { id: "c-du-cas", documentId: DOC, pageStart: 8, pageEnd: 8, contentHash: "h8", content: "balance du cas écarté", sectionTitle: "S" }
    ]
  } as unknown as CorpusDocument;

  return {
    listDocuments: () => [document],
    getDocument: () => document,
    getChunk: () => undefined
  } as unknown as CorpusIndex;
}

const EXCLUSION: EditorialScopeExclusion = editorialScopeSchema.parse({
  chapterSlug: "chapitre-test",
  scopeLabel: "V1",
  exclusions: [
    {
      id: "v1-cas-ecarte",
      caseLabel: "Cas écarté",
      reason: "visual-sources-pending-human-review",
      pages: { [DOC]: [8] },
      annotationIds: ["annotation-du-cas"]
    }
  ]
}).exclusions[0];

const OPTIONS = { chapterSlug: "chapitre-test", chapterLabel: "Chapitre test", sourcePackId: "pack" };

describe("le défaut reproduit", () => {
  it("sans périmètre déclaré, le chunk du cas écarté entre dans l'enveloppe", () => {
    const envelope = buildSourceEnvelope(corpus(), OPTIONS);
    const ids = envelope.documents.flatMap((document) => document.chunks.map((chunk) => chunk.chunkId));

    // La page est fiable : aucune garde technique ne la retient. C'est bien le
    // périmètre éditorial, et lui seul, qui doit l'écarter.
    expect(ids).toContain("c-du-cas");
  });

  it("avec le périmètre déclaré, il est retiré avant d'atteindre le prompt", () => {
    const envelope = buildSourceEnvelope(corpus(), { ...OPTIONS, scopeExclusions: [EXCLUSION] });
    const ids = envelope.documents.flatMap((document) => document.chunks.map((chunk) => chunk.chunkId));

    expect(ids).toEqual(["c-hors-cas"]);
    expect(JSON.stringify(envelope.documents)).not.toContain("balance du cas écarté");
    expect(envelope.excluded.find((item) => item.chunkId === "c-du-cas")?.reason).toContain("hors périmètre éditorial");
  });
});

describe("correspondance d'une exclusion", () => {
  it("laisse passer une source hors exclusion", () => {
    expect(isWithinScope([EXCLUSION], { documentId: DOC, pageStart: 1, pageEnd: 1, chunkId: "c-hors-cas" })).toBe(true);
  });

  it("retient une page exclue", () => {
    expect(findScopeViolation([EXCLUSION], { documentId: DOC, pageStart: 8, pageEnd: 8 })?.pageNumber).toBe(8);
  });

  it("retient une annotation exclue, fût-elle approuvée", () => {
    expect(findScopeViolation([EXCLUSION], { annotationId: "annotation-du-cas" })?.annotationId).toBe(
      "annotation-du-cas"
    );
  });

  it("retient un chunk nommé même si sa page n'est pas listée", () => {
    const byChunk = editorialScopeSchema.parse({
      chapterSlug: "c",
      scopeLabel: "V1",
      exclusions: [{ id: "x", reason: "r", chunkIds: ["c-precis"] }]
    }).exclusions;

    expect(isWithinScope(byChunk, { documentId: "autre", pageStart: 99, chunkId: "c-precis" })).toBe(false);
  });

  it("refuse une exclusion qui ne désigne rien", () => {
    const parsed = editorialScopeSchema.safeParse({
      chapterSlug: "c",
      scopeLabel: "V1",
      exclusions: [{ id: "vide", reason: "r" }]
    });

    expect(parsed.success).toBe(false);
  });
});

describe("second verrou : références d'un contenu rédigé à la main", () => {
  const reference = (page: number, chunkId: string) => ({
    documentId: DOC,
    pageStart: page,
    pageEnd: page,
    chunkIds: [chunkId]
  });

  it("accepte une référence hors exclusion", () => {
    expect(() => assertReferencesWithinScope([EXCLUSION], [reference(1, "c-hors-cas")])).not.toThrow();
  });

  it("refuse une charge utile manuelle qui cite le cas écarté", () => {
    try {
      assertReferencesWithinScope([EXCLUSION], [reference(1, "c-hors-cas"), reference(8, "c-du-cas")]);
      expect.unreachable("la citation hors périmètre aurait dû être refusée");
    } catch (error) {
      expect(error).toBeInstanceOf(ExcludedEditorialScopeError);
      expect((error as ExcludedEditorialScopeError).code).toBe(EXCLUDED_EDITORIAL_SCOPE_CONSUMED);
      expect((error as ExcludedEditorialScopeError).violations).toHaveLength(1);
    }
  });

  it("ne contrôle rien quand aucun périmètre n'est déclaré", () => {
    expect(() => assertReferencesWithinScope([], [reference(8, "c-du-cas")])).not.toThrow();
  });
});

describe("chargement de la politique", () => {
  async function workspace(content?: unknown): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "scope-"));
    const dir = join(root, "generated", "review");
    await mkdir(dir, { recursive: true });

    if (content !== undefined) {
      await writeFile(
        join(dir, editorialScopeFileName("chapitre-test")),
        typeof content === "string" ? content : JSON.stringify(content),
        "utf8"
      );
    }

    return root;
  }

  it("absence de fichier : comportement historique", async () => {
    const loaded = await loadChapterEditorialScope({
      dataDir: await workspace(),
      chapterSlug: "chapitre-test"
    });

    expect(loaded.configured).toBe(false);
    expect(loaded.exclusions).toEqual([]);
  });

  it("fichier illisible : refus, jamais « pas de périmètre »", async () => {
    await expect(
      loadChapterEditorialScope({ dataDir: await workspace("{ pas du JSON"), chapterSlug: "chapitre-test" })
    ).rejects.toBeInstanceOf(EditorialScopeInvalidError);
  });

  it("politique valide : exclusions chargées", async () => {
    const loaded = await loadChapterEditorialScope({
      dataDir: await workspace({
        chapterSlug: "chapitre-test",
        scopeLabel: "V1",
        exclusions: [{ id: "x", reason: "r", pages: { [DOC]: [8] } }]
      }),
      chapterSlug: "chapitre-test"
    });

    expect(loaded.configured).toBe(true);
    expect(loaded.exclusions).toHaveLength(1);
  });
});

describe("les deux gardes restent distinctes", () => {
  it("une page non fiable ET exclue est retenue par la première garde, sans contournement", () => {
    const usability = new Map([
      [
        `${DOC}:8`,
        { documentId: DOC, pageNumber: 8, usability: "visual_required" as const, reason: "couche texte non fidèle" }
      ]
    ]);

    const envelope = buildSourceEnvelope(corpus(), {
      ...OPTIONS,
      pageUsability: usability,
      scopeExclusions: [EXCLUSION]
    });

    expect(envelope.documents.flatMap((document) => document.chunks.map((chunk) => chunk.chunkId))).toEqual([
      "c-hors-cas"
    ]);
    // Le motif retenu est celui de la fiabilité : elle s'applique en premier.
    expect(envelope.excluded.find((item) => item.chunkId === "c-du-cas")?.reason).toContain("classée");
  });
});
