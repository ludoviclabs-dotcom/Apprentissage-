import "server-only";
import { revalidatePath } from "next/cache";
import {
  archiveVersion,
  buildPublishedVersion,
  contentHash,
  inspectForPublication,
  publicationKeyOf,
  publishVersion,
  resolvePublicChapter,
  resolveSlug,
  UnknownChapterError,
  type PublicationIndexEntry,
  storedNormativeFields,
  type PublicationReport,
  type PublishedContentVersion
} from "@finance/content-publication";
import { recordArchivedVersion, recordPublishedVersion } from "@finance/db";
import {
  findDraft,
  loadCorpusIndex,
  type DraftWithLocation
} from "@/lib/content-review/service";
import {
  findActive,
  loadPublishedVersion,
  publicationStoreDriver,
  publicationStoreOptions,
  PublicationStoreUnavailableError,
  type PublishedEntry
} from "@/lib/publication/store";

/**
 * Le service de publication.
 *
 * TOUTE DÉCISION EST PRISE ICI, CÔTÉ SERVEUR, À PARTIR DE CE QUE LE DISQUE DIT.
 * Le navigateur n'envoie qu'un identifiant de brouillon : ni le statut, ni le
 * verdict de validation, ni la version cible ne sont acceptés de lui. Masquer le
 * bouton « Publier » dans l'interface est un confort de lecture ; ce qui empêche
 * réellement une publication interdite est le refus de cette fonction.
 *
 * L'ORDRE DES ÉCRITURES SUIT LA SOURCE DE VÉRITÉ. La base est écrite d'abord et
 * doit réussir : elle est ce que la production sert. Le magasin de fichiers
 * n'est mis à jour qu'en développement, ou sur demande explicite, et un échec
 * de la base interrompt la publication au lieu de laisser un contenu visible
 * quelque part et absent ailleurs.
 */

/** Alias local : le magasin de fichiers rend ses entrées sous cette forme. */
type PublishedFileEntry = PublicationIndexEntry;

export interface PublicationPreview {
  report: PublicationReport;
  draft: DraftWithLocation;
  /** Ce que la publication produirait : identité logique et URL cible. */
  target: {
    artifactType: string;
    chapter: string;
    chapterLabel: string;
    slug: string;
    module: string;
    publicUrl: string;
    publicationVersion: number;
    sourceCount: number;
  };
  /** La version actuellement active, qui serait archivée. */
  currentActive: PublishedEntry | null;
}

export class DraftNotFoundError extends Error {
  constructor(draftId: string) {
    super(`brouillon « ${draftId} » introuvable`);
    this.name = "DraftNotFoundError";
  }
}

export function publicChapterUrl(chapter: string): string {
  return `/modules/comptabilite-approfondie/${chapter}`;
}

/**
 * Inspecte un brouillon sans rien publier.
 *
 * C'est ce que la boîte de confirmation affiche, et c'est exactement le même
 * appel que `publishDraft` refait avant d'écrire : la prévisualisation ne peut
 * donc pas annoncer un verdict que la publication contredirait.
 */
export async function previewPublication(draftId: string): Promise<PublicationPreview> {
  const entry = await findDraft(draftId);

  if (!entry) {
    throw new DraftNotFoundError(draftId);
  }

  const chapter = resolvePublicChapter(entry.draft.chapterSlug);

  if (!chapter) {
    throw new UnknownChapterError(entry.draft.chapterSlug);
  }

  const corpus = await loadCorpusIndex(entry.location.packId);
  const key = {
    artifactType: entry.draft.contentType,
    chapter: chapter.slug,
    slug: resolveSlug(entry.draft)
  };
  // Interrogé via le magasin courant, pas le fichier : en production c'est la
  // base qui sait quelle version est active, et prévisualiser contre un index
  // de fichiers annoncerait un numéro de version faux.
  const active = (await findActive(key)) ?? null;

  const report = inspectForPublication({
    draft: entry.draft,
    corpus,
    currentVersion: active?.publicationVersion ?? 0,
    // L'empreinte du contenu relu n'est pas stockée sur le brouillon : elle est
    // recalculée sur ce que le disque contient maintenant. Le contrôle de
    // divergence ne mord donc que lors d'une republication, où l'on dispose de
    // l'empreinte de la version active à comparer.
    reviewedContentHash: undefined
  });

  return {
    report,
    draft: entry,
    target: {
      artifactType: entry.draft.contentType,
      chapter: chapter.slug,
      chapterLabel: chapter.label,
      slug: key.slug,
      module: "comptabilite-approfondie",
      publicUrl: publicChapterUrl(chapter.slug),
      publicationVersion: report.publicationVersion,
      sourceCount: report.sourceIntegrity.referenceCount
    },
    currentActive: active
  };
}

export interface PublishOutcome {
  published: PublishedContentVersion;
  archived: PublicationIndexEntry | null;
  report: PublicationReport;
  /** Faux quand la base n'a pas pu enregistrer l'acte. Le contenu est publié. */
  auditRecorded: boolean;
  auditReason?: string;
}

export class PublicationRefused extends Error {
  constructor(readonly report: PublicationReport) {
    super("publication refusée par les contrôles");
    this.name = "PublicationRefused";
  }
}

/**
 * Publie un brouillon approuvé.
 *
 * Les contrôles sont rejoués ici, et non repris de la prévisualisation : entre
 * l'affichage de la boîte de confirmation et le clic, une source peut avoir
 * bougé. C'est la lecture littérale de « la vérification doit être relancée au
 * moment exact de la publication ».
 */
export async function publishDraft(input: {
  draftId: string;
  actor: string;
  comment?: string;
}): Promise<PublishOutcome> {
  const entry = await findDraft(input.draftId);

  if (!entry) {
    throw new DraftNotFoundError(input.draftId);
  }

  const chapter = resolvePublicChapter(entry.draft.chapterSlug);

  if (!chapter) {
    throw new UnknownChapterError(entry.draft.chapterSlug);
  }

  const options = publicationStoreOptions();
  const corpus = await loadCorpusIndex(entry.location.packId);
  const key = {
    artifactType: entry.draft.contentType,
    chapter: chapter.slug,
    slug: resolveSlug(entry.draft)
  };
  const active = (await findActive(key)) ?? null;

  const report = inspectForPublication({
    draft: entry.draft,
    corpus,
    currentVersion: active?.publicationVersion ?? 0
  });

  if (!report.passed) {
    throw new PublicationRefused(report);
  }

  const publishedAt = new Date().toISOString();
  const version = buildPublishedVersion({
    draft: entry.draft,
    publishedBy: input.actor,
    publishedAt,
    publicationVersion: report.publicationVersion,
    previousPublishedVersionId: active?.id ?? null
  });

  // Défensif, et pas redondant : `buildPublishedVersion` recalcule l'empreinte à
  // partir de la charge utile qu'il a lui-même reparsée. Si elle divergeait de
  // celle du rapport, l'instantané publié ne serait pas celui que les contrôles
  // ont examiné.
  if (version.contentHash !== report.contentHash) {
    throw new Error(
      "incohérence interne : l'empreinte de l'instantané diffère de celle contrôlée — publication interrompue"
    );
  }

  // Idempotence : republier un contenu dont l'empreinte est déjà celle de la
  // version active ne crée rien. Le contrôle est fait ici, avant toute écriture,
  // pour qu'il vaille quel que soit le magasin.
  if (active && active.contentHash === version.contentHash) {
    const existing = await loadPublishedVersion(active.id);

    if (existing) {
      return { published: existing, archived: null, report, auditRecorded: true };
    }
  }

  // ORDRE DES ÉCRITURES : LA SOURCE DE VÉRITÉ D'ABORD.
  //
  // Quand la base est le magasin de production, c'est elle qui doit réussir : un
  // échec y interrompt la publication, et le miroir de fichiers n'est pas écrit.
  // L'inverse — écrire le fichier puis échouer en base — laisserait un contenu
  // visible en développement et absent en production, c'est-à-dire deux vérités.
  const driver = publicationStoreDriver();

  if (driver === null) {
    throw new PublicationStoreUnavailableError(
      "aucun magasin de contenu publié n'est configuré : publication impossible"
    );
  }

  const audit = await recordPublishedVersion(
    {
      id: version.id,
      sourceArtifactId: version.sourceArtifactId,
      artifactType: version.artifactType,
      title: version.title,
      slug: version.slug,
      domain: version.domain,
      module: version.module,
      chapter: version.chapter,
      chapterLabel: version.chapterLabel,
      contentSnapshot: version.contentSnapshot,
      sourceReferencesSnapshot: version.sourceReferencesSnapshot,
      publicationVersion: version.publicationVersion,
      publishedAt: version.publishedAt,
      publishedBy: version.publishedBy,
      generationMetadataSnapshot: version.generationMetadataSnapshot,
      validationMetadataSnapshot: version.validationMetadataSnapshot,
      reviewMetadataSnapshot: version.reviewMetadataSnapshot,
      contentHash: version.contentHash,
      previousPublishedVersionId: version.previousPublishedVersionId,
      // Le référentiel et les deux champs qui en dérivent, par la même fonction
      // que l'index du magasin de fichiers : les deux pilotes écrivent le même
      // contrat, sans que la règle soit écrite deux fois.
      ...storedNormativeFields(version)
    },
    {
      action: active ? "republish" : "publish",
      versionId: version.id,
      previousVersionId: active?.id ?? null,
      artifactType: version.artifactType,
      chapter: version.chapter,
      slug: version.slug,
      publicationVersion: version.publicationVersion,
      actor: input.actor,
      comment: input.comment ?? null,
      contentHash: version.contentHash
    }
  );

  // La base est le magasin de production : si elle n'a rien enregistré, rien
  // n'est publié. Le refus est explicite plutôt que silencieux — un relecteur
  // qui a cliqué « Publier » doit savoir que rien n'a eu lieu.
  if (driver === "database" && audit.status !== "written") {
    throw new PublicationStoreUnavailableError(
      `publication impossible : la base n'a pas enregistré la version (${audit.status === "unavailable" ? audit.reason : "raison inconnue"})`
    );
  }

  // Le miroir de fichiers n'est écrit que là où il sert : développement et
  // tests. En production il n'est pas la source, et l'écrire donnerait une
  // seconde vérité à maintenir.
  let archived: PublishedFileEntry | null = null;

  if (driver === "file" || fileMirrorEnabled()) {
    const result = await publishVersion(options, version);
    archived = result.archived;
  }

  invalidate(version.chapter);

  return {
    published: version,
    archived,
    report,
    auditRecorded: audit.status === "written",
    auditReason: audit.status === "unavailable" ? audit.reason : undefined
  };
}

/**
 * Faut-il tenir le magasin de fichiers à jour en plus de la base ?
 *
 * Utile sur une installation locale qui a les deux : le fichier reste relisible
 * en diff. Jamais activé par défaut, parce qu'en production il ferait diverger
 * deux sources dont une seule est lue.
 */
function fileMirrorEnabled(): boolean {
  return process.env.MIRROR_PUBLICATION_TO_FILES === "true";
}

export interface ArchiveOutcome {
  archivedVersionId: string;
  archivedAt: string;
  auditRecorded: boolean;
  auditReason?: string;
}

/**
 * Retire un contenu du site public sans le supprimer.
 *
 * L'instantané reste stocké : « ne pas supprimer physiquement une ancienne
 * version » vaut aussi pour un retrait volontaire, et un contenu archivé doit
 * rester consultable par un relecteur qui cherche à comprendre ce qui a été
 * servi.
 */
export async function archivePublishedVersion(input: {
  versionId: string;
  actor: string;
  comment?: string;
}): Promise<ArchiveOutcome> {
  const options = publicationStoreOptions();
  const driver = publicationStoreDriver();

  if (driver === null) {
    throw new PublicationStoreUnavailableError(
      "aucun magasin de contenu publié n'est configuré : archivage impossible"
    );
  }

  const version = await loadPublishedVersion(input.versionId);

  if (!version) {
    throw new Error(`version publiée « ${input.versionId} » introuvable ou déjà archivée`);
  }

  const archivedAt = new Date().toISOString();

  if (driver === "file" || fileMirrorEnabled()) {
    await archiveVersion(options, input.versionId, archivedAt);
  }

  const key = publicationKeyOf(version);
  const audit = await recordArchivedVersion(input.versionId, archivedAt, {
    action: "archive",
    versionId: input.versionId,
    previousVersionId: null,
    artifactType: key.artifactType,
    chapter: key.chapter,
    slug: key.slug,
    publicationVersion: version.publicationVersion,
    actor: input.actor,
    comment: input.comment ?? null,
    contentHash: version.contentHash
  });

  if (driver === "database" && audit.status !== "written") {
    throw new PublicationStoreUnavailableError(
      `archivage impossible : la base n'a rien enregistré (${audit.status === "unavailable" ? audit.reason : "raison inconnue"})`
    );
  }

  invalidate(version.chapter);

  return {
    archivedVersionId: input.versionId,
    archivedAt,
    auditRecorded: audit.status === "written",
    auditReason: audit.status === "unavailable" ? audit.reason : undefined
  };
}

/**
 * Invalide ce qui pourrait encore servir l'ancienne version.
 *
 * `revalidatePath` en mode `layout` couvre la page du module et toutes les pages
 * de chapitre en dessous, ce qui est exactement la portée d'une publication : un
 * chapitre gagne ou perd un contenu, et la liste du module change avec lui.
 *
 * LA PROGRESSION N'EST JAMAIS DANS UN CACHE PARTAGÉ. Les pages de chapitre sont
 * rendues dynamiquement parce qu'elles affichent l'avancement de *ce* lecteur ;
 * il n'existe donc aucune entrée de cache partagée susceptible de contenir une
 * progression personnelle. C'est la raison pour laquelle il n'y a pas ici de
 * `revalidateTag` sur un contenu mis en cache par ailleurs : le contenu publié
 * est relu du disque à chaque rendu, à quelques kilo-octets par chapitre, et
 * `cache()` dédoublonne les lectures d'un même rendu.
 */
function invalidate(chapter: string): void {
  revalidatePath("/modules/comptabilite-approfondie", "layout");
  revalidatePath(publicChapterUrl(chapter), "layout");
}

export { contentHash };
