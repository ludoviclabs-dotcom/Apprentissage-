import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  contentManifestSchema,
  extractedDocumentArtifactSchema,
  isBlockingIssue,
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

/**
 * Les documents d'un pack, lus depuis ses artefacts d'extraction.
 *
 * Séparé de {@link loadCorpus} parce qu'un index peut désormais réunir
 * plusieurs packs : le pack du chapitre, et les référentiels transversaux qui
 * n'appartiennent à aucun chapitre.
 */
async function readPackDocuments(
  extractedDir: string,
  packId: string
): Promise<{ manifest: ContentManifest; documents: CorpusDocument[] }> {
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
        packId,
        title: entry.originalName.replace(/\.[^.]+$/, ""),
        relativePath: artifact.relativePath,
        category: artifact.category,
        domainId: artifact.domainId,
        chapterSlug: entry.chapterSlug,
        pages: artifact.pages.map((page) => ({
          pageNumber: page.pageNumber,
          // « Dégradée » veut dire « une partie du contenu manque au texte », et
          // non « quelque chose a été signalé ». Une page peu dense mais
          // fidèlement extraite porte un constat `informational` : elle reste
          // citable, et le garde de publication n'a pas à la refuser.
          degraded: page.issues.some(isBlockingIssue)
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

  return { manifest, documents };
}

export async function loadCorpus(extractedDir: string, packId: string): Promise<LoadedCorpus> {
  const { manifest, documents } = await readPackDocuments(extractedDir, packId);

  return { packId, manifest, index: new CorpusIndex(documents) };
}

/**
 * Un pack est un référentiel quand il ne porte que des documents de référence.
 *
 * Le critère est délibérément strict : « au moins un document de référence »
 * aurait fait entrer un pack de chapitre entier dans l'index d'un autre chapitre
 * dès qu'il contient un extrait de norme, et un contenu aurait pu citer le cours
 * d'un chapitre voisin sans que rien ne le signale.
 */
function isReferencePack(manifest: ContentManifest): boolean {
  return manifest.files.length > 0 && manifest.files.every((file) => file.category === "reference");
}

/**
 * Le corpus d'un chapitre, augmenté des référentiels transversaux.
 *
 * UN RÉFÉRENTIEL N'APPARTIENT À AUCUN CHAPITRE, ET C'EST TOUT LE PROBLÈME QUE
 * CETTE FONCTION RÉSOUT. Le plan comptable vaut pour les emprunts obligataires
 * comme pour les contrats à long terme : le ranger dans le pack d'un chapitre
 * serait faux, et l'y recopier une fois par chapitre le serait tout autant. Il
 * vit donc dans son propre pack — mais un index limité à un seul pack rendait
 * alors ses documents introuvables, si bien qu'un contenu qui citait le PCG
 * était refusé pour « document inconnu ». Le modèle normatif exige pourtant
 * qu'un contenu du profil en vigueur cite une référence officielle : sans cette
 * réunion, l'exigence était intenable.
 *
 * Ce que la réunion n'ouvre pas : les packs de chapitres restent étanches entre
 * eux. Seuls les packs entièrement composés de documents de référence sont
 * joints, et `manifest` reste celui du pack demandé — les chapitres, les
 * voisinages de doublons et la résolution `--chapter` continuent de ne voir que
 * le pack du contenu.
 */
export async function loadCorpusWithReferences(
  extractedDir: string,
  packId: string
): Promise<LoadedCorpus> {
  const own = await readPackDocuments(extractedDir, packId);
  const documents = [...own.documents];

  if (existsSync(extractedDir)) {
    for (const candidate of (await readdir(extractedDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== packId)
      .map((entry) => entry.name)
      .sort()) {
      try {
        const other = await readPackDocuments(extractedDir, candidate);

        if (isReferencePack(other.manifest)) {
          documents.push(...other.documents);
        }
      } catch {
        // Un pack voisin non extrait, ou dont le manifeste a été écrasé, ne doit
        // pas empêcher de relire le chapitre demandé. Son absence se constate
        // ailleurs : `content:validate` le dit, et une référence vers un de ses
        // documents échouera de toute façon en « document inconnu ».
        continue;
      }
    }
  }

  return { packId, manifest: own.manifest, index: new CorpusIndex(documents) };
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
