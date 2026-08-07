import "server-only";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cache } from "react";
import {
  activeEntriesForChapter,
  contentHash,
  findActiveEntry,
  findHistory,
  publishedContentVersionSchema,
  readIndex,
  readVersion,
  SnapshotIntegrityError,
  type PublicationIndexEntry,
  type PublicationKey,
  type PublishedContentVersion
} from "@finance/content-publication";
import { isPublishableGenerationMode } from "@finance/content-generation";
import {
  canUseDatabase,
  getPublishedVersion,
  getPublishedVersionHistory,
  listPublishedChapterVersions,
  listPublishedModuleVersions,
  PublishedContentUnavailableError,
  type PublishedVersionSummary
} from "@finance/db";

/**
 * Accès en **lecture** au contenu publié.
 *
 * DEUX MAGASINS, UN SEUL EN PRODUCTION. La base de données est la source de
 * vérité : c'est elle qui est interrogeable, qui fait respecter « une seule
 * version active » entre deux publications concurrentes, et qui vit avec les
 * données plutôt qu'avec le bundle. Le magasin de fichiers reste disponible pour
 * le développement et les tests, où monter PostgreSQL pour lire une fiche serait
 * disproportionné — mais il faut le **demander explicitement**, et il est refusé
 * en production sauf aveu nominatif.
 *
 * AUCUN REPLI SILENCIEUX. Si la base est la source configurée et qu'elle est
 * injoignable, la lecture lève : l'écran affiche « indisponible », jamais un
 * chapitre vide qui ferait croire que rien n'est publié, et jamais une fixture.
 * C'est la même règle que `getErrorJournal` applique déjà au catalogue seedé.
 *
 * Ce module n'expose aucune écriture. Publier et archiver vivent dans
 * `service.ts`, derrière `requireAdmin`.
 */

export type PublicationStoreDriver = "database" | "file";

/**
 * Choix du magasin, décidé une fois et pour toutes au chargement du module.
 *
 * L'ordre des tests compte :
 *
 * 1. une base configurée gagne toujours — c'est la source de vérité ;
 * 2. sinon, le magasin de fichiers, à condition d'être autorisé ;
 * 3. sinon, aucun magasin : les lectures rendent « indisponible ».
 *
 * Le cas 3 est délibérément un échec bruyant plutôt qu'un chapitre vide. Une
 * production mal configurée doit se voir, pas se déguiser en « rien de publié ».
 */
function resolveDriver(): PublicationStoreDriver | null {
  if (canUseDatabase()) {
    return "database";
  }

  return fileStoreAllowed() ? "file" : null;
}

/**
 * Le magasin de fichiers est-il autorisé ici ?
 *
 * Hors production, oui : c'est le mode de travail normal d'une installation
 * locale sans PostgreSQL. En production, non — sauf
 * `ALLOW_FILE_PUBLICATION_STORE=true`, qui est un aveu explicite pour le serveur
 * end-to-end et pour une installation privée que personne d'autre ne joint. Le
 * drapeau reprend exactement l'idiome de `CONTENT_REVIEW_ALLOW_UNAUTHENTICATED`,
 * qui existe pour la même raison : `next start` tourne en `NODE_ENV=production`
 * même quand personne ne le déploie.
 */
function fileStoreAllowed(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return process.env.ALLOW_FILE_PUBLICATION_STORE === "true";
}

export function publicationStoreDriver(): PublicationStoreDriver | null {
  return resolveDriver();
}

/**
 * Racine du dépôt. Next.js s'exécute depuis `apps/web`, un runner de test ou un
 * script depuis la racine : on retient le premier emplacement où `content/`
 * existe réellement — la même heuristique que `content-review/service.ts`
 * applique à `data/`.
 */
function repoContentDir(): string {
  const candidates = [join(process.cwd(), "..", "..", "content"), join(process.cwd(), "content")];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export const PUBLISHED_ROOT =
  process.env.PUBLISHED_CONTENT_ROOT ?? join(repoContentDir(), "published");

export function publicationStoreOptions(): { rootDir: string } {
  return { rootDir: PUBLISHED_ROOT };
}

/** Levée quand aucun magasin n'est disponible, ou que celui-ci est injoignable. */
export class PublicationStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicationStoreUnavailableError";
  }
}

const NO_STORE =
  "aucun magasin de contenu publié n'est configuré : définir FINANCE_HUB_USE_DATABASE=true et DATABASE_URL, ou autoriser le magasin de fichiers hors production";

/**
 * Un contenu publié dont on n'a besoin que du résumé.
 *
 * Forme commune aux deux magasins, pour que les pages ne sachent pas lequel
 * répond.
 */
export interface PublishedEntry {
  id: string;
  artifactType: string;
  module: string;
  chapter: string;
  slug: string;
  title: string;
  publicationVersion: number;
  publishedAt: string;
  contentHash: string;
}

function fromSummary(row: PublishedVersionSummary): PublishedEntry {
  return {
    id: row.id,
    artifactType: row.artifactType,
    module: row.module,
    chapter: row.chapter,
    slug: row.slug,
    title: row.title,
    publicationVersion: row.publicationVersion,
    publishedAt: row.publishedAt,
    contentHash: row.contentHash
  };
}

function fromIndexEntry(entry: PublicationIndexEntry): PublishedEntry {
  return {
    id: entry.id,
    artifactType: entry.artifactType,
    module: entry.module,
    chapter: entry.chapter,
    slug: entry.slug,
    title: entry.title,
    publicationVersion: entry.publicationVersion,
    publishedAt: entry.publishedAt,
    contentHash: entry.contentHash
  };
}

/**
 * Un contenu produit en mode `mock` n'atteint jamais un lecteur.
 *
 * Le garde le refuse déjà à la publication, et le magasin de fichiers le refuse
 * à l'écriture. Ce troisième filtre porte sur la **lecture** : il couvre le cas
 * qu'aucun des deux autres ne couvre — une ligne insérée à la main, un magasin
 * de test monté par erreur, une base restaurée depuis un environnement de
 * recette. Trois barrières indépendantes pour une règle dont la violation est
 * précisément ce que le cahier des charges interdit.
 *
 * La liste des modes acceptés est celle du paquet de génération, et non une
 * copie locale : trois barrières ne valent que si elles disent toutes la même
 * chose, et une quatrième définition du mot « publiable » finirait par diverger.
 */
function isPublishableVersion(version: PublishedContentVersion): boolean {
  return isPublishableGenerationMode(version.generationMetadataSnapshot.mode);
}

// --- Lectures ---------------------------------------------------------------

async function loadEntriesForChapter(module: string, chapter: string): Promise<PublishedEntry[]> {
  const driver = resolveDriver();

  if (driver === null) {
    throw new PublicationStoreUnavailableError(NO_STORE);
  }

  if (driver === "database") {
    return (await listPublishedChapterVersions(module, chapter)).map(fromSummary);
  }

  return activeEntriesForChapter(await readIndex(publicationStoreOptions()), chapter).map(
    fromIndexEntry
  );
}

async function loadEntriesForModule(module: string): Promise<PublishedEntry[]> {
  const driver = resolveDriver();

  if (driver === null) {
    throw new PublicationStoreUnavailableError(NO_STORE);
  }

  if (driver === "database") {
    return (await listPublishedModuleVersions(module)).map(fromSummary);
  }

  const index = await readIndex(publicationStoreOptions());

  return index.entries
    .filter((entry) => entry.status === "published" && entry.module === module)
    .sort((left, right) => left.chapter.localeCompare(right.chapter) || left.slug.localeCompare(right.slug))
    .map(fromIndexEntry);
}

/** Dédoublonné à l'échelle d'un rendu par `cache()` ; rien n'est retenu entre deux requêtes. */
export const listChapterEntries = cache(
  async (module: string, chapter: string): Promise<PublishedEntry[]> =>
    loadEntriesForChapter(module, chapter)
);

export const listModuleEntries = cache(
  async (module: string): Promise<PublishedEntry[]> => loadEntriesForModule(module)
);

/**
 * Un instantané complet, par identifiant.
 *
 * Rend `undefined` pour un identifiant inconnu **ou archivé** : dans les deux
 * cas il n'y a rien à servir, et distinguer les deux renseignerait un appelant
 * sur l'existence d'un contenu retiré.
 */
export const loadPublishedVersion = cache(
  async (id: string): Promise<PublishedContentVersion | undefined> => {
    const driver = resolveDriver();

    if (driver === null) {
      throw new PublicationStoreUnavailableError(NO_STORE);
    }

    const version =
      driver === "database"
        ? await loadFromDatabase(id)
        : await readVersion(publicationStoreOptions(), id);

    if (!version || version.status !== "published" || !isPublishableVersion(version)) {
      return undefined;
    }

    return version;
  }
);

/**
 * La ligne de base repassée par le schéma Zod du paquet de publication.
 *
 * Reparser plutôt que caster : la colonne est du JSONB, donc son contenu n'est
 * garanti par rien côté base, et une ligne écrite par une version antérieure du
 * code doit échouer ici plutôt que d'atteindre un composant sous un type qu'elle
 * ne respecte pas.
 */
async function loadFromDatabase(id: string): Promise<PublishedContentVersion | undefined> {
  const row = await getPublishedVersion(id);

  if (!row) {
    return undefined;
  }

  const version = publishedContentVersionSchema.parse({
    ...row,
    contentSnapshot: row.contentSnapshot,
    sourceReferencesSnapshot: row.sourceReferencesSnapshot,
    generationMetadataSnapshot: row.generationMetadataSnapshot,
    validationMetadataSnapshot: row.validationMetadataSnapshot,
    reviewMetadataSnapshot: row.reviewMetadataSnapshot
  });

  // L'EMPREINTE EST VÉRIFIÉE ICI AUSSI, PAS SEULEMENT SUR LE MAGASIN DE
  // FICHIERS. `readVersion` recalcule le hash parce qu'un fichier commité peut
  // être retouché à la main ; une ligne de base peut l'être tout autant — par
  // une migration de données, une restauration partielle, un `UPDATE` en
  // console. N'avoir vérifié que le chemin de développement aurait laissé le
  // chemin de *production* seul sans contrôle, ce qui est l'inverse de la
  // priorité voulue.
  if (contentHash(version.contentSnapshot) !== version.contentHash) {
    throw new SnapshotIntegrityError(id);
  }

  return version;
}

export async function listChapterEntriesOfType(
  module: string,
  chapter: string,
  artifactType: string
): Promise<PublishedEntry[]> {
  return (await listChapterEntries(module, chapter)).filter(
    (entry) => entry.artifactType === artifactType
  );
}

/** Les instantanés d'un type donné, pour un chapitre. */
export async function loadChapterVersionsOfType(
  module: string,
  chapter: string,
  artifactType: string
): Promise<PublishedContentVersion[]> {
  const entries = await listChapterEntriesOfType(module, chapter, artifactType);
  const versions: PublishedContentVersion[] = [];

  for (const entry of entries) {
    const version = await loadPublishedVersion(entry.id);

    if (version) {
      versions.push(version);
    }
  }

  return versions;
}

// --- Lectures d'administration ----------------------------------------------
//
// Elles servent l'écran de relecture, pas le site public : elles peuvent donc
// consulter l'historique, archives comprises.

export async function findActive(key: PublicationKey): Promise<PublishedEntry | undefined> {
  const driver = resolveDriver();

  if (driver === null) {
    return undefined;
  }

  if (driver === "database") {
    const rows = await getPublishedVersionHistory(key.artifactType, key.chapter, key.slug);
    const active = rows.find((row) => row.status === "published");

    return active ? fromSummary(active) : undefined;
  }

  const entry = findActiveEntry(await readIndex(publicationStoreOptions()), key);

  return entry ? fromIndexEntry(entry) : undefined;
}

export interface PublishedHistoryEntry extends PublishedEntry {
  status: string;
  archivedAt: string | null;
  publishedBy: string;
}

export async function loadHistory(key: PublicationKey): Promise<PublishedHistoryEntry[]> {
  const driver = resolveDriver();

  if (driver === null) {
    return [];
  }

  if (driver === "database") {
    return (await getPublishedVersionHistory(key.artifactType, key.chapter, key.slug)).map((row) => ({
      ...fromSummary(row),
      status: row.status,
      archivedAt: row.archivedAt,
      publishedBy: row.publishedBy
    }));
  }

  return findHistory(await readIndex(publicationStoreOptions()), key).map((entry) => ({
    ...fromIndexEntry(entry),
    status: entry.status,
    archivedAt: entry.archivedAt,
    publishedBy: entry.publishedBy
  }));
}

export { PublishedContentUnavailableError };
