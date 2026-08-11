import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PageUsabilityMapInvalidError,
  PageUsabilityMapNotAppliedError,
  PageUsabilityMapRequiredError,
  buildSourceEnvelope,
  loadChapterPageUsability,
  pageUsabilityFileName,
  requiresPageUsabilityMap,
  type CorpusDocument,
  type CorpusIndex
} from "../src/index";

/**
 * Le câblage, pas la politique.
 *
 * Que `buildSourceEnvelope` sache écarter une page non fiable est déjà couvert
 * ailleurs. Ce fichier vérifie l'autre moitié, celle qui manquait : que le
 * chemin de production charge la carte et la transmette, et qu'il refuse plutôt
 * que de continuer sans elle.
 */

function chunk(id: string, page: number, content: string) {
  return { id, documentId: "doc-1", pageStart: page, pageEnd: page, contentHash: `hash-${id}`, content, sectionTitle: "S" };
}

function corpusWith(degradedPage: number | null): { index: CorpusIndex; documents: CorpusDocument[] } {
  const document = {
    documentId: "doc-1",
    packId: "pack",
    title: "Support",
    category: "course",
    domainId: "compta-generale",
    chapterSlug: "chapitre-test",
    chapterLabel: "Chapitre test",
    pages: [
      { pageNumber: 1, degraded: false },
      { pageNumber: 2, degraded: degradedPage === 2 }
    ],
    chunks: [chunk("c1", 1, "texte visible et fiable"), chunk("c2", 2, "texte de la page suspecte")]
  } as unknown as CorpusDocument;

  const index = {
    listDocuments: () => [document],
    getDocument: () => document,
    getChunk: () => undefined
  } as unknown as CorpusIndex;

  return { index, documents: [document] };
}

async function workspace(map?: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "usability-"));
  const dir = join(root, "generated", "review");
  await mkdir(dir, { recursive: true });

  if (map !== undefined) {
    await writeFile(
      join(dir, pageUsabilityFileName("chapitre-test")),
      typeof map === "string" ? map : JSON.stringify(map),
      "utf8"
    );
  }

  return root;
}

const VALID_MAP = {
  pack: "pack",
  pages: [
    {
      documentId: "doc-1",
      pageNumber: 2,
      usability: "visual_required",
      reason: "la couche texte porte autre chose que ce que la page affiche"
    }
  ]
};

describe("exigence dérivée du corpus", () => {
  it("exige une carte dès qu'une page est dégradée", () => {
    expect(requiresPageUsabilityMap(corpusWith(2).documents)).toBe(true);
  });

  it("n'exige rien d'un corpus intact : les chapitres historiques ne changent pas", () => {
    expect(requiresPageUsabilityMap(corpusWith(null).documents)).toBe(false);
  });
});

describe("fail closed", () => {
  it("refuse quand la carte est obligatoire et absente", async () => {
    const { documents } = corpusWith(2);
    const dataDir = await workspace();

    await expect(
      loadChapterPageUsability({ dataDir, chapterSlug: "chapitre-test", documents })
    ).rejects.toBeInstanceOf(PageUsabilityMapRequiredError);
  });

  it("refuse une carte illisible", async () => {
    const { documents } = corpusWith(2);
    const dataDir = await workspace("{ ceci n'est pas du JSON");

    await expect(
      loadChapterPageUsability({ dataDir, chapterSlug: "chapitre-test", documents })
    ).rejects.toBeInstanceOf(PageUsabilityMapInvalidError);
  });

  it("refuse une carte au classement inconnu", async () => {
    const { documents } = corpusWith(2);
    const dataDir = await workspace({
      pack: "pack",
      pages: [{ documentId: "doc-1", pageNumber: 2, usability: "peut-être", reason: "x" }]
    });

    await expect(
      loadChapterPageUsability({ dataDir, chapterSlug: "chapitre-test", documents })
    ).rejects.toBeInstanceOf(PageUsabilityMapInvalidError);
  });

  it("accepte une carte valide et la marque comme obligatoire", async () => {
    const { documents } = corpusWith(2);
    const dataDir = await workspace(VALID_MAP);
    const loaded = await loadChapterPageUsability({ dataDir, chapterSlug: "chapitre-test", documents });

    expect(loaded.required).toBe(true);
    expect(loaded.configured).toBe(true);
    expect(loaded.pageUsability?.get("doc-1:2")?.usability).toBe("visual_required");
  });

  it("laisse passer un chapitre sans exigence ni carte", async () => {
    const { documents } = corpusWith(null);
    const dataDir = await workspace();
    const loaded = await loadChapterPageUsability({ dataDir, chapterSlug: "chapitre-test", documents });

    expect(loaded.required).toBe(false);
    expect(loaded.configured).toBe(false);
    expect(loaded.pageUsability).toBeUndefined();
  });
});

describe("garde du constructeur", () => {
  const options = {
    chapterSlug: "chapitre-test",
    chapterLabel: "Chapitre test",
    sourcePackId: "pack"
  };

  it("refuse de construire quand la carte est obligatoire mais absente", () => {
    expect(() =>
      buildSourceEnvelope(corpusWith(2).index, { ...options, requirePageUsability: true })
    ).toThrowError(PageUsabilityMapNotAppliedError);
  });

  it("construit normalement un chapitre sans exigence", () => {
    const envelope = buildSourceEnvelope(corpusWith(null).index, options);

    expect(envelope.documents[0].chunks).toHaveLength(2);
  });
});

describe("câblage complet : chargement puis construction", () => {
  it("écarte le chunk de la page non fiable par le chemin réel", async () => {
    const { index, documents } = corpusWith(2);
    const dataDir = await workspace(VALID_MAP);

    const usability = await loadChapterPageUsability({
      dataDir,
      chapterSlug: "chapitre-test",
      documents
    });

    const envelope = buildSourceEnvelope(index, {
      chapterSlug: "chapitre-test",
      chapterLabel: "Chapitre test",
      sourcePackId: "pack",
      pageUsability: usability.pageUsability,
      requirePageUsability: usability.required
    });

    const included = envelope.documents.flatMap((document) => document.chunks.map((entry) => entry.chunkId));

    expect(included).toEqual(["c1"]);
    expect(included).not.toContain("c2");
    expect(envelope.excluded.map((item) => item.chunkId)).toContain("c2");
    // Le texte de la page suspecte ne doit pas non plus transiter par une autre
    // voie : on vérifie son absence du contenu, pas seulement de la liste d'ids.
    expect(JSON.stringify(envelope.documents)).not.toContain("page suspecte");
  });

  it("aurait laissé passer ce chunk sans la carte — c'est le défaut corrigé", () => {
    const envelope = buildSourceEnvelope(corpusWith(2).index, {
      chapterSlug: "chapitre-test",
      chapterLabel: "Chapitre test",
      sourcePackId: "pack"
    });

    expect(envelope.documents[0].chunks.map((entry) => entry.chunkId)).toContain("c2");
  });
});
