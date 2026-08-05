import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  contentManifestSchema,
  extractedDocumentArtifactSchema,
  type ContentManifest
} from "@finance/ingest";
import { CorpusIndex, type CorpusDocument } from "../types/source-reference";

/**
 * Chargement du corpus extrait vers un index vérifiable.
 *
 * Les identifiants de document suivent la convention déjà utilisée par
 * l'import en base — `<packId>-<sha256[0..12]>` — pour qu'une référence produite
 * ici désigne la même ligne `documents` le jour où les contenus approuvés seront
 * publiés. Aucun chemin absolu n'entre dans l'index.
 */

export function documentIdFor(packId: string, sha256: string): string {
  return `${packId}-${sha256.slice(0, 12)}`;
}

export interface LoadedCorpus {
  packId: string;
  manifest: ContentManifest;
  index: CorpusIndex;
}

export class CorpusNotExtractedError extends Error {
  constructor(path: string) {
    super(
      `corpus introuvable : ${path}\n` +
        "Lancer d'abord : pnpm content:scan puis pnpm content:extract."
    );
    this.name = "CorpusNotExtractedError";
  }
}

export async function loadCorpus(extractedDir: string, packId: string): Promise<LoadedCorpus> {
  const packDir = join(extractedDir, packId);
  const manifestPath = join(packDir, "manifest.json");

  if (!existsSync(manifestPath)) {
    throw new CorpusNotExtractedError(manifestPath);
  }

  const manifest = contentManifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const pagesDir = join(packDir, "pages");
  const documents: CorpusDocument[] = [];

  if (existsSync(pagesDir)) {
    const entryBySha = new Map(manifest.files.map((file) => [file.sha256, file]));

    for (const fileName of (await readdir(pagesDir)).sort()) {
      if (!fileName.endsWith(".json")) {
        continue;
      }

      const artifact = extractedDocumentArtifactSchema.parse(
        JSON.parse(await readFile(join(pagesDir, fileName), "utf8"))
      );

      const entry = entryBySha.get(artifact.sha256);

      if (!entry) {
        // Artefact orphelin : déjà signalé par content:validate, ignoré ici.
        continue;
      }

      documents.push({
        documentId: documentIdFor(packId, artifact.sha256),
        title: entry.originalName.replace(/\.[^.]+$/, ""),
        relativePath: artifact.relativePath,
        category: artifact.category,
        domainId: artifact.domainId,
        chapterSlug: entry.chapterSlug,
        pages: artifact.pages.map((page) => ({
          pageNumber: page.pageNumber,
          degraded: page.issues.length > 0
        })),
        chunks: artifact.chunks.map((chunk) => ({
          id: chunk.id,
          documentId: documentIdFor(packId, artifact.sha256),
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          contentHash: chunk.contentHash,
          content: chunk.content,
          sectionTitle: chunk.sectionTitle
        }))
      });
    }
  }

  return { packId, manifest, index: new CorpusIndex(documents) };
}

export interface ChapterSummary {
  chapterSlug: string;
  chapterLabel: string;
  domainId: string;
  documentCount: number;
  categories: string[];
}

/** Chapitres réellement disponibles, pour que la CLI puisse les proposer. */
export function listChapters(corpus: LoadedCorpus): ChapterSummary[] {
  const byChapter = new Map<string, ChapterSummary>();

  for (const file of corpus.manifest.files) {
    const existing = byChapter.get(file.chapterSlug);

    if (existing) {
      existing.documentCount += 1;
      if (!existing.categories.includes(file.category)) {
        existing.categories.push(file.category);
      }
      continue;
    }

    byChapter.set(file.chapterSlug, {
      chapterSlug: file.chapterSlug,
      chapterLabel: file.chapterLabel,
      domainId: file.domainId,
      documentCount: 1,
      categories: [file.category]
    });
  }

  return [...byChapter.values()].sort((left, right) => left.chapterSlug.localeCompare(right.chapterSlug));
}

/**
 * Résout un chapitre depuis ce que l'utilisateur a tapé : slug exact, ou
 * libellé approché (accents et casse ignorés). Une saisie ambiguë est refusée
 * plutôt que tranchée au hasard.
 */
export function resolveChapter(corpus: LoadedCorpus, input: string): ChapterSummary {
  const chapters = listChapters(corpus);
  const normalize = (value: string): string =>
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  const wanted = normalize(input);
  const exact = chapters.find((chapter) => chapter.chapterSlug === input);

  if (exact) {
    return exact;
  }

  const matches = chapters.filter(
    (chapter) =>
      normalize(chapter.chapterLabel) === wanted ||
      normalize(chapter.chapterSlug) === wanted ||
      normalize(chapter.chapterLabel).includes(wanted)
  );

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(
      `chapitre ambigu « ${input} » — préciser le slug parmi : ${matches.map((chapter) => chapter.chapterSlug).join(", ")}`
    );
  }

  throw new Error(
    `chapitre introuvable « ${input} ». Chapitres disponibles :\n` +
      chapters.map((chapter) => `  - ${chapter.chapterSlug} (${chapter.chapterLabel})`).join("\n")
  );
}
