import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { documentIdFor, loadCorpus, loadCorpusWithReferences } from "../src/corpus/load";

/**
 * Un référentiel n'appartient à aucun chapitre.
 *
 * Le plan comptable vaut pour les emprunts obligataires comme pour les contrats
 * à long terme : il vit dans son propre pack. Un index limité à un seul pack
 * rendait alors ses documents introuvables, et un contenu qui le citait était
 * refusé pour « document inconnu » — alors même que le modèle normatif exige
 * qu'un contenu du profil en vigueur cite une référence officielle.
 *
 * Ce que ces tests fixent est autant ce qui s'ouvre que ce qui reste fermé :
 * les packs de chapitres ne doivent pas se voir les uns les autres.
 */

const CHAPTER_SHA = "1".repeat(64);
const REFERENCE_SHA = "2".repeat(64);
const OTHER_CHAPTER_SHA = "3".repeat(64);

function artifact(sha256: string, category: string, chunkId: string) {
  return {
    sha256,
    relativePath: `${category}.pdf`,
    extension: ".pdf",
    domainId: "compta-generale",
    category,
    status: "extracted",
    pageCount: 1,
    pages: [{ pageNumber: 1, rawText: "texte", markdownText: "texte", issues: [] }],
    chunks: [
      {
        id: chunkId,
        sectionTitle: "Sans titre",
        content: "Le compte 481 « Frais d'émission des emprunts ».",
        contentHash: "a".repeat(64),
        pageStart: 1,
        pageEnd: 1
      }
    ],
    issues: []
  };
}

function manifest(packId: string, sha256: string, category: string) {
  return {
    packId,
    generatedAt: "2026-08-08T00:00:00.000Z",
    files: [
      {
        relativePath: `${category}.pdf`,
        originalName: `${category}.pdf`,
        extension: ".pdf",
        sizeBytes: 1000,
        sha256,
        domainId: "compta-generale",
        category,
        chapterLabel: "Chapitre",
        chapterSlug: "chapitre",
        variantKey: "",
        extraction: { status: "extracted", pageCount: 1, issues: [] }
      }
    ],
    skipped: [],
    counts: { files: 1, skipped: 0, byCategory: { [category]: 1 }, byDomain: { "compta-generale": 1 } }
  };
}

async function writePack(
  extractedDir: string,
  packId: string,
  sha256: string,
  category: string,
  chunkId: string
): Promise<void> {
  const packDir = join(extractedDir, packId);
  await mkdir(join(packDir, "pages"), { recursive: true });
  await writeFile(
    join(packDir, "manifest.json"),
    JSON.stringify(manifest(packId, sha256, category)),
    "utf8"
  );
  await writeFile(
    join(packDir, "pages", `${sha256.slice(0, 12)}.json`),
    JSON.stringify(artifact(sha256, category, chunkId)),
    "utf8"
  );
}

describe("corpus — référentiels transversaux", () => {
  let extractedDir: string;

  beforeAll(async () => {
    extractedDir = await mkdtemp(join(tmpdir(), "corpus-references-"));
    await writePack(extractedDir, "chapitre-pack", CHAPTER_SHA, "course", "chunk-cours");
    await writePack(extractedDir, "reference-pack", REFERENCE_SHA, "reference", "chunk-pcg");
    await writePack(extractedDir, "autre-chapitre", OTHER_CHAPTER_SHA, "course", "chunk-autre");
  });

  it("ne voit qu'un pack avec le chargeur simple", async () => {
    const corpus = await loadCorpus(extractedDir, "chapitre-pack");

    expect(corpus.index.size).toBe(1);
    expect(corpus.index.getDocument(documentIdFor("reference-pack", REFERENCE_SHA))).toBeUndefined();
  });

  it("joint les référentiels au pack du chapitre", async () => {
    const corpus = await loadCorpusWithReferences(extractedDir, "chapitre-pack");
    const reference = corpus.index.getDocument(documentIdFor("reference-pack", REFERENCE_SHA));

    expect(reference?.packId).toBe("reference-pack");
    expect(reference?.category).toBe("reference");
    expect(corpus.index.getChunk(reference!.documentId, "chunk-pcg")).toBeDefined();
  });

  it("laisse les packs de chapitres étanches entre eux", async () => {
    const corpus = await loadCorpusWithReferences(extractedDir, "chapitre-pack");

    expect(corpus.index.getDocument(documentIdFor("autre-chapitre", OTHER_CHAPTER_SHA))).toBeUndefined();
    expect(corpus.index.size).toBe(2);
  });

  it("garde le manifeste du pack demandé", async () => {
    // `--chapter`, les voisinages de doublons et la liste des chapitres se
    // déduisent du manifeste : y verser les documents d'un référentiel ferait
    // apparaître un « chapitre » qui n'en est pas un.
    const corpus = await loadCorpusWithReferences(extractedDir, "chapitre-pack");

    expect(corpus.packId).toBe("chapitre-pack");
    expect(corpus.manifest.files).toHaveLength(1);
    expect(corpus.manifest.files[0].category).toBe("course");
  });
});
