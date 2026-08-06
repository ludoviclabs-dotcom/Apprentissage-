import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { assertSnapshotPublishable } from "./guard";
import { contentHash } from "./hash";
import {
  publicationKeyOf,
  publishedContentVersionSchema,
  serializePublicationKey,
  type PublicationKey,
  type PublishedContentVersion
} from "./types";

/**
 * Le magasin des versions publiées.
 *
 * IL EST COMMITÉ, ET C'EST LA CONSÉQUENCE DU GARDE, PAS UN RELÂCHEMENT.
 * `data/generated/drafts/` est git-ignoré parce que personne ne sait ce qu'un
 * brouillon contient — du texte recopié d'un PDF privé, un chemin de machine, une
 * fixture. Un instantané publié a passé `inspectForPublication`, qui refuse
 * précisément ces trois choses. Ce qui interdisait de commiter cesse donc de
 * s'appliquer, et trois propriétés s'ouvrent : le site public fonctionne sans
 * base de données, une publication se relit en diff avant d'atteindre la
 * production, et `pnpm build` ne touche ni réseau ni fichier privé.
 *
 * RIEN N'EST JAMAIS RÉÉCRIT. Un fichier de version, une fois écrit, ne bouge
 * plus. Publier une nouvelle version écrit un nouveau fichier ; archiver
 * l'ancienne modifie l'index, pas l'instantané. C'est ce qui rend vraie la phrase
 * « une modification ultérieure du brouillon n'altère pas rétroactivement la
 * version publique » — il n'existe aucun chemin de code qui rouvre un instantané
 * en écriture.
 *
 * L'ÉCRITURE EST ATOMIQUE PAR L'INDEX. L'instantané est écrit d'abord, l'index
 * ensuite via un fichier temporaire renommé. Tant que l'index n'a pas basculé,
 * l'instantané n'est visible de personne : un plantage entre les deux laisse un
 * fichier orphelin, jamais une version à moitié publiée. L'orphelin est supprimé
 * si le renommage échoue.
 */

const INDEX_FILE = "index.json";
const VERSIONS_DIR = "versions";

/**
 * L'index : ce qu'il faut pour répondre « quelle version est active ? » sans
 * ouvrir un seul instantané. Une page de chapitre lit donc un fichier, puis
 * exactement les instantanés qu'elle affiche.
 */
const indexEntrySchema = z.object({
  id: z.string().min(1),
  artifactType: z.string().min(1),
  module: z.string().min(1),
  chapter: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  publicationVersion: z.number().int().min(1),
  status: z.enum(["published", "archived"]),
  publishedAt: z.string().min(1),
  publishedBy: z.string().min(1),
  archivedAt: z.string().min(1).nullable(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourceArtifactId: z.string().min(1)
});

export type PublicationIndexEntry = z.infer<typeof indexEntrySchema>;

const indexSchema = z.object({
  /** Version du format du magasin, pour qu'une évolution soit détectable. */
  formatVersion: z.literal(1),
  entries: z.array(indexEntrySchema)
});

export type PublicationIndex = z.infer<typeof indexSchema>;

const EMPTY_INDEX: PublicationIndex = { formatVersion: 1, entries: [] };

export interface PublicationStoreOptions {
  /** Racine du magasin, typiquement `<repo>/content/published`. */
  rootDir: string;
}

function indexPath(options: PublicationStoreOptions): string {
  return join(options.rootDir, INDEX_FILE);
}

function versionPath(options: PublicationStoreOptions, id: string): string {
  return join(options.rootDir, VERSIONS_DIR, `${id}.json`);
}

export async function readIndex(options: PublicationStoreOptions): Promise<PublicationIndex> {
  const path = indexPath(options);

  if (!existsSync(path)) {
    return EMPTY_INDEX;
  }

  return indexSchema.parse(JSON.parse(await readFile(path, "utf8")));
}

/**
 * Écrit l'index par fichier temporaire puis renommage.
 *
 * `rename` est atomique sur un même volume : un lecteur concurrent voit soit
 * l'ancien index, soit le nouveau, jamais un fichier tronqué.
 */
async function writeIndex(options: PublicationStoreOptions, index: PublicationIndex): Promise<void> {
  await mkdir(options.rootDir, { recursive: true });
  const target = indexPath(options);
  const temporary = `${target}.tmp`;

  await writeFile(temporary, `${JSON.stringify(indexSchema.parse(index), null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

function toIndexEntry(version: PublishedContentVersion): PublicationIndexEntry {
  return {
    id: version.id,
    artifactType: version.artifactType,
    module: version.module,
    chapter: version.chapter,
    slug: version.slug,
    title: version.title,
    publicationVersion: version.publicationVersion,
    status: version.status,
    publishedAt: version.publishedAt,
    publishedBy: version.publishedBy,
    archivedAt: version.archivedAt,
    contentHash: version.contentHash,
    sourceArtifactId: version.sourceArtifactId
  };
}

/** Levée quand un instantané ne correspond plus à son empreinte. */
export class SnapshotIntegrityError extends Error {
  constructor(readonly versionId: string) {
    super(
      `l'instantané « ${versionId} » ne correspond plus à son empreinte : le fichier a été modifié après publication`
    );
    this.name = "SnapshotIntegrityError";
  }
}

/**
 * Lit un instantané et vérifie son empreinte.
 *
 * La vérification n'est pas décorative : le magasin étant un répertoire de
 * fichiers commités, une retouche manuelle est physiquement possible. Le hash
 * transforme « on ne modifie pas un instantané » d'une convention en un fait
 * constatable, et une retouche fait échouer la lecture au lieu d'atteindre un
 * visiteur.
 */
export async function readVersion(
  options: PublicationStoreOptions,
  id: string
): Promise<PublishedContentVersion | undefined> {
  const path = versionPath(options, id);

  if (!existsSync(path)) {
    return undefined;
  }

  const version = publishedContentVersionSchema.parse(JSON.parse(await readFile(path, "utf8")));

  if (contentHash(version.contentSnapshot) !== version.contentHash) {
    throw new SnapshotIntegrityError(id);
  }

  return version;
}

export interface PublishResult {
  version: PublishedContentVersion;
  /** La version que celle-ci vient d'archiver, s'il y en avait une. */
  archived: PublicationIndexEntry | null;
}

/** Levée quand un instantané non publiable atteint malgré tout l'écriture. */
export class UnpublishableSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnpublishableSnapshotError";
  }
}

/**
 * Ultime barrière avant l'écriture.
 *
 * Le garde a déjà refusé le mode `mock` et les chaînes interdites en amont ;
 * ce contrôle-ci porte sur l'objet réellement écrit, et il couvre le chemin
 * qu'aucun autre ne couvre — un appelant qui construirait un instantané à la
 * main, un test qui contournerait `inspectForPublication`, une évolution du
 * code qui oublierait l'ordre des appels. Trois barrières indépendantes pour la
 * règle dont la violation est précisément ce que le cahier des charges
 * interdit.
 */
function assertPublishableSnapshot(version: PublishedContentVersion): void {
  if (version.generationMetadataSnapshot.mode !== "live") {
    throw new UnpublishableSnapshotError(
      `« ${version.id} » vient d'une fixture (mode « ${version.generationMetadataSnapshot.mode} ») : un contenu de démonstration ne s'écrit pas dans le magasin publié`
    );
  }

  if (version.status !== "published") {
    throw new UnpublishableSnapshotError(
      `« ${version.id} » est en « ${version.status} » : seul un instantané actif s'écrit`
    );
  }

  if (contentHash(version.contentSnapshot) !== version.contentHash) {
    throw new UnpublishableSnapshotError(
      `« ${version.id} » ne correspond pas à son empreinte : le contenu a changé après construction`
    );
  }

  assertSnapshotPublishable(version as unknown as Record<string, unknown>);
}

/**
 * La version active d'une identité logique, ou `undefined`.
 *
 * L'invariant « une seule version active par (type, chapitre, slug) » est
 * maintenu à l'écriture ; cette lecture ne le suppose pas pour autant : elle
 * retient la version la plus élevée si l'invariant venait à être violé par une
 * édition manuelle du magasin, plutôt que la première rencontrée.
 */
export function findActiveEntry(
  index: PublicationIndex,
  key: PublicationKey
): PublicationIndexEntry | undefined {
  const serialized = serializePublicationKey(key);

  return index.entries
    .filter(
      (entry) =>
        entry.status === "published" &&
        serializePublicationKey({
          artifactType: entry.artifactType as PublicationKey["artifactType"],
          chapter: entry.chapter,
          slug: entry.slug
        }) === serialized
    )
    .sort((left, right) => right.publicationVersion - left.publicationVersion)[0];
}

export function findHistory(index: PublicationIndex, key: PublicationKey): PublicationIndexEntry[] {
  const serialized = serializePublicationKey(key);

  return index.entries
    .filter(
      (entry) =>
        serializePublicationKey({
          artifactType: entry.artifactType as PublicationKey["artifactType"],
          chapter: entry.chapter,
          slug: entry.slug
        }) === serialized
    )
    .sort((left, right) => right.publicationVersion - left.publicationVersion);
}

/**
 * Publie une version et archive celle qu'elle remplace, en une seule bascule
 * d'index.
 *
 * IDEMPOTENT SUR UN CONTENU INCHANGÉ. Republier un contenu dont l'empreinte est
 * déjà celle de la version active ne crée pas de doublon : la version existante
 * est renvoyée telle quelle. Sans cela, un double-clic sur « Publier »
 * fabriquerait une v2 identique à la v1 et archiverait une version pour rien.
 */
export async function publishVersion(
  options: PublicationStoreOptions,
  version: PublishedContentVersion
): Promise<PublishResult> {
  assertPublishableSnapshot(version);

  const index = await readIndex(options);
  const key = publicationKeyOf(version);
  const active = findActiveEntry(index, key);

  if (active && active.contentHash === version.contentHash) {
    const existing = await readVersion(options, active.id);

    if (existing) {
      return { version: existing, archived: null };
    }
  }

  const path = versionPath(options, version.id);

  if (existsSync(path)) {
    throw new Error(
      `l'instantané « ${version.id} » existe déjà : un instantané publié n'est jamais réécrit`
    );
  }

  await mkdir(join(options.rootDir, VERSIONS_DIR), { recursive: true });
  await writeFile(path, `${JSON.stringify(publishedContentVersionSchema.parse(version), null, 2)}\n`, "utf8");

  try {
    await writeIndex(options, {
      formatVersion: 1,
      entries: [
        ...index.entries.map((entry) =>
          active && entry.id === active.id
            ? { ...entry, status: "archived" as const, archivedAt: version.publishedAt }
            : entry
        ),
        toIndexEntry(version)
      ]
    });
  } catch (error) {
    // L'index n'a pas basculé : l'instantané n'est visible de personne. On le
    // retire pour ne pas laisser un orphelin qui bloquerait une republication
    // sous le même identifiant.
    await rm(path, { force: true });
    throw error;
  }

  return {
    version,
    archived: active ? { ...active, status: "archived", archivedAt: version.publishedAt } : null
  };
}

/**
 * Archive la version active d'une identité logique sans la remplacer.
 *
 * Le chapitre cesse alors d'exposer ce contenu. L'instantané reste sur disque :
 * « ne pas supprimer physiquement une ancienne version » vaut aussi pour un
 * retrait volontaire.
 */
export async function archiveVersion(
  options: PublicationStoreOptions,
  versionId: string,
  archivedAt: string
): Promise<PublicationIndexEntry | null> {
  const index = await readIndex(options);
  const entry = index.entries.find((candidate) => candidate.id === versionId);

  if (!entry || entry.status === "archived") {
    return null;
  }

  const archived = { ...entry, status: "archived" as const, archivedAt };

  await writeIndex(options, {
    formatVersion: 1,
    entries: index.entries.map((candidate) => (candidate.id === versionId ? archived : candidate))
  });

  return archived;
}

/** Les entrées actives d'un chapitre, tous types confondus. */
export function activeEntriesForChapter(
  index: PublicationIndex,
  chapter: string
): PublicationIndexEntry[] {
  return index.entries
    .filter((entry) => entry.status === "published" && entry.chapter === chapter)
    .sort((left, right) => left.slug.localeCompare(right.slug));
}
