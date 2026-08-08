import "server-only";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  advanceAfterValidation,
  applyTransition,
  contentDraftSchema,
  listDrafts,
  readDraft,
  toValidationMetadata,
  validateContent,
  writeDraft,
  CorpusIndex,
  loadCorpusWithReferences,
  materialKindForCategory,
  type ContentDraft,
  type ContentDraftStatus,
  type ContentPayload,
  type SourceMaterialKind
} from "@finance/content-generation";
import { notFound } from "next/navigation";
import { getEnv } from "@/lib/env";
import { resolveAdmin } from "@/lib/auth/require-admin";

/**
 * Accès serveur aux brouillons de contenu.
 *
 * Les brouillons vivent sur disque sous `data/generated/drafts/`, hors Git. Ce
 * module est la seule porte d'entrée de l'application : il ne renvoie jamais un
 * chemin de fichier, seulement du contenu et des métadonnées, pour qu'aucune
 * information sur l'arborescence privée n'atteigne le navigateur.
 */

/**
 * Racine du dépôt. Next.js s'exécute depuis `apps/web`, mais un runner de test
 * ou un script peut partir de la racine : on retient le premier emplacement où
 * `data/` existe réellement plutôt que de supposer l'un des deux.
 */
function repoDataDir(): string {
  const candidates = [join(process.cwd(), "..", "..", "data"), join(process.cwd(), "data")];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

const DRAFTS_ROOT = join(repoDataDir(), "generated", "drafts");
const EXTRACTED_ROOT = join(repoDataDir(), "extracted");

export interface DraftLocation {
  packId: string;
  chapterSlug: string;
}

/** Parcourt `data/generated/drafts/<pack>/<chapitre>/`. */
export async function listDraftLocations(): Promise<DraftLocation[]> {
  if (!existsSync(DRAFTS_ROOT)) {
    return [];
  }

  const locations: DraftLocation[] = [];

  for (const packId of (await readdir(DRAFTS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()) {
    const packDir = join(DRAFTS_ROOT, packId);

    for (const chapterSlug of (await readdir(packDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()) {
      locations.push({ packId, chapterSlug });
    }
  }

  return locations;
}

export interface DraftWithLocation {
  draft: ContentDraft;
  location: DraftLocation;
}

export async function loadAllDrafts(): Promise<DraftWithLocation[]> {
  const results: DraftWithLocation[] = [];

  for (const location of await listDraftLocations()) {
    const drafts = await listDrafts({
      rootDir: DRAFTS_ROOT,
      packId: location.packId,
      chapterSlug: location.chapterSlug
    });

    for (const draft of drafts) {
      results.push({ draft, location });
    }
  }

  return results.sort((left, right) => right.draft.updatedAt.localeCompare(left.draft.updatedAt));
}

export async function findDraft(draftId: string): Promise<DraftWithLocation | undefined> {
  for (const location of await listDraftLocations()) {
    const draft = await readDraft(
      { rootDir: DRAFTS_ROOT, packId: location.packId, chapterSlug: location.chapterSlug },
      draftId
    );

    if (draft) {
      return { draft, location };
    }
  }

  return undefined;
}

/**
 * Corpus du pack, pour revérifier les références et afficher au relecteur le
 * texte source réellement cité. Chargé à la demande : la revue d'un brouillon
 * n'oblige pas à charger tous les packs.
 *
 * Les référentiels transversaux — le plan comptable — sont joints au pack du
 * chapitre : ils n'appartiennent à aucun chapitre, et un contenu qui cite le
 * PCG doit pouvoir être vérifié comme les autres. Les packs de chapitres, eux,
 * restent étanches entre eux.
 */
export async function loadCorpusIndex(packId: string): Promise<CorpusIndex | undefined> {
  try {
    return (await loadCorpusWithReferences(EXTRACTED_ROOT, packId)).index;
  } catch {
    // Corpus absent (extraction non lancée sur cette machine) : la revue reste
    // possible, les références sont simplement affichées sans leur texte.
    return undefined;
  }
}

export interface SourceExcerpt {
  documentTitle: string;
  pageStart: number;
  pageEnd: number;
  degraded: boolean;
  /**
   * Nature du matériau, déduite de la catégorie du document dans le corpus.
   *
   * Elle vient du corpus et non de la référence : une référence peut se tromper
   * sur ce qu'elle cite — le validateur refuse déjà ce cas — alors que la
   * catégorie du document est établie par l'ingestion. C'est elle qui permet
   * à l'écran de séparer les sources normatives des sources pédagogiques.
   */
  materialKind: SourceMaterialKind;
  chunks: Array<{ chunkId: string; content: string; pageStart: number; pageEnd: number }>;
}

/**
 * Résout les références d'un brouillon en extraits lisibles. Ne renvoie ni
 * chemin, ni nom de fichier sur disque — seulement le titre du document.
 */
export function resolveExcerpts(draft: ContentDraft, index: CorpusIndex | undefined): SourceExcerpt[] {
  if (!index) {
    return [];
  }

  const corpus = index;
  const seen = new Set<string>();
  const excerpts: SourceExcerpt[] = [];

  function walk(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }

    if (value === null || typeof value !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === "sourceReferences" && Array.isArray(child)) {
        for (const reference of child as Array<{
          documentId: string;
          pageStart: number;
          pageEnd: number;
          chunkIds: string[];
        }>) {
          const key = `${reference.documentId}:${reference.pageStart}-${reference.pageEnd}`;

          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          const document = corpus.getDocument(reference.documentId);

          if (!document) {
            continue;
          }

          const pages = document.pages.filter(
            (page) => page.pageNumber >= reference.pageStart && page.pageNumber <= reference.pageEnd
          );

          excerpts.push({
            documentTitle: document.title,
            pageStart: reference.pageStart,
            pageEnd: reference.pageEnd,
            degraded: pages.some((page) => page.degraded),
            materialKind: materialKindForCategory(document.category),
            chunks: reference.chunkIds
              .map((chunkId) => corpus.getChunk(reference.documentId, chunkId))
              .filter((chunk): chunk is NonNullable<typeof chunk> => Boolean(chunk))
              .map((chunk) => ({
                chunkId: chunk.id,
                content: chunk.content,
                pageStart: chunk.pageStart,
                pageEnd: chunk.pageEnd
              }))
          });
        }
        continue;
      }

      walk(child);
    }
  }

  walk(draft.content);
  return excerpts;
}

/**
 * Revalide un brouillon contre le corpus, met à jour ses métadonnées et fait
 * suivre son statut. La progression est celle du package
 * (`advanceAfterValidation`), pour que l'interface et la CLI ne puissent pas
 * diverger sur ce qu'une validation autorise.
 */
export async function revalidateDraft(
  entry: DraftWithLocation,
  now: string,
  actor = "validator"
): Promise<{ draft: ContentDraft; passed: boolean; corpusAvailable: boolean }> {
  const corpus = await loadCorpusIndex(entry.location.packId);
  const payload = { contentType: entry.draft.contentType, content: entry.draft.content } as ContentPayload;

  if (!corpus) {
    // Sans corpus, aucune référence n'est vérifiable. On ne rejoue donc rien et
    // on ne rend surtout pas l'ancien verdict comme s'il venait d'être
    // reconfirmé : `corpusAvailable: false` oblige l'appelant à distinguer
    // « revalidé avec succès » de « impossible à revalider », et l'approbation
    // refuse le second cas.
    return { draft: entry.draft, passed: false, corpusAvailable: false };
  }

  // Les autres brouillons du même chapitre servent de voisinage : sans eux, le
  // contrôle de doublon s'exécute sur une liste vide et une carte identique à
  // une autre passe la revue alors que la génération l'aurait refusée. Les
  // contenus déjà écartés (échec, rejet) n'en font pas partie — un doublon d'un
  // contenu abandonné n'en est pas un — et le brouillon lui-même est exclu,
  // sans quoi il serait son propre doublon.
  const siblings = (
    await listDrafts({
      rootDir: DRAFTS_ROOT,
      packId: entry.location.packId,
      chapterSlug: entry.location.chapterSlug
    })
  )
    .filter(
      (candidate) =>
        candidate.id !== entry.draft.id &&
        candidate.status !== "validation_failed" &&
        candidate.status !== "rejected"
    )
    .map((candidate) => ({ contentType: candidate.contentType, content: candidate.content }) as ContentPayload);

  const result = validateContent({
    payload,
    corpus,
    siblings,
    normativeContext: entry.draft.normativeContext
  });
  const revalidated = {
    ...entry.draft,
    validationMetadata: toValidationMetadata(result, now),
    updatedAt: now
  } as ContentDraft;

  return {
    draft: advanceAfterValidation(
      revalidated,
      result.passed,
      now,
      actor,
      result.passed ? undefined : result.blockingReasons.slice(0, 3).join(" | ").slice(0, 2000)
    ),
    passed: result.passed,
    corpusAvailable: true
  };
}

export async function persistDraft(entry: DraftWithLocation, draft: ContentDraft): Promise<void> {
  await writeDraft(
    { rootDir: DRAFTS_ROOT, packId: entry.location.packId, chapterSlug: entry.location.chapterSlug },
    contentDraftSchema.parse(draft)
  );
}

export interface TransitionRequest {
  draftId: string;
  to: ContentDraftStatus;
  actor: string;
  comment?: string;
}

export { applyTransition };

/**
 * Garde d'accès de l'espace de relecture.
 *
 * Deux verrous : le drapeau d'instance, et le rôle administrateur. Un refus
 * répond 404 comme le reste de l'administration — annoncer « interdit »
 * confirmerait que l'espace existe.
 *
 * Deux variantes, parce que `notFound()` n'existe que dans le rendu : les pages
 * l'utilisent, les routes API renvoient une réponse.
 */
export async function requireReviewAccess(): Promise<{ actor: string }> {
  if (!getEnv().CONTENT_REVIEW_ENABLED) {
    notFound();
  }

  const admin = await resolveAdmin();

  if (!admin) {
    notFound();
  }

  return { actor: admin.actor };
}

export async function requireReviewApiAccess(): Promise<
  { actor: string; response?: never } | { actor?: never; response: Response }
> {
  const refusal = Response.json({ error: "Ressource introuvable" }, { status: 404 });

  if (!getEnv().CONTENT_REVIEW_ENABLED) {
    return { response: refusal };
  }

  const admin = await resolveAdmin();

  return admin ? { actor: admin.actor } : { response: refusal };
}

export function isReviewEnabled(): boolean {
  return getEnv().CONTENT_REVIEW_ENABLED;
}
