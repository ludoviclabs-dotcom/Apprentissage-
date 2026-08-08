import {
  collectSourceReferences,
  contentPayloadSchema,
  sourceReferenceSchema,
  type ContentDraft
} from "@finance/content-generation";
import { contentHash } from "./hash";
import { findRemainingExcerptPaths, stripSourceExcerpts } from "./sanitize";
import { COMPTA_APPROFONDIE_MODULE, resolvePublicChapter } from "./taxonomy";
import {
  publicationVersionId,
  publishedContentVersionSchema,
  publishedSourceReferenceSchema,
  type PublicationKey,
  type PublishedContentVersion,
  type PublishedSourceReference
} from "./types";

/**
 * Construction de l'instantané publié.
 *
 * Tout ce qui entre ici est recopié ; rien n'est référencé. Le seul champ qui
 * pointe encore vers l'amont est `sourceArtifactId`, et il ne sert qu'à la
 * traçabilité : aucune lecture publique ne le déréférence.
 */

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Le slug logique d'un contenu.
 *
 * La fiche de révision porte le sien dans son schéma ; les autres types le
 * dérivent de leur titre. Dériver plutôt que tirer au sort est ce qui permet à
 * une deuxième publication du même contenu de retrouver sa propre lignée et
 * d'archiver la version précédente au lieu d'en créer une concurrente.
 */
export function resolveSlug(draft: ContentDraft): string {
  const content = draft.content as { slug?: unknown; title?: unknown };

  if (typeof content.slug === "string" && /^[a-z0-9-]+$/.test(content.slug)) {
    return content.slug;
  }

  const fromTitle = slugify(typeof content.title === "string" ? content.title : draft.title);

  // Un titre entièrement non alphanumérique — improbable, mais le schéma ne
  // l'interdit pas — laisserait un slug vide et donc une URL cassée.
  return fromTitle.length > 0 ? fromTitle : slugify(draft.id);
}

/**
 * Les références du contenu, dédupliquées et dépouillées de leur texte.
 *
 * `excerpt` et `excerptHash` sont retirés ici, une fois pour toutes : c'est le
 * seul endroit où le texte des sources privées pourrait franchir la frontière du
 * commit, et il ne le franchit pas.
 */
export function collectPublishedReferences(draft: ContentDraft): PublishedSourceReference[] {
  const seen = new Set<string>();
  const references: PublishedSourceReference[] = [];

  for (const { reference } of collectSourceReferences({
    contentType: draft.contentType,
    content: draft.content
  } as Parameters<typeof collectSourceReferences>[0])) {
    const parsed = sourceReferenceSchema.safeParse(reference);

    if (!parsed.success) {
      continue;
    }

    const { excerpt: _excerpt, excerptHash: _excerptHash, ...rest } = parsed.data;
    const key = `${rest.documentId}:${rest.pageStart}-${rest.pageEnd}:${rest.sectionTitle ?? ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    references.push(publishedSourceReferenceSchema.parse(rest));
  }

  return references;
}

export class UnknownChapterError extends Error {
  constructor(readonly chapterSlug: string) {
    super(
      `le chapitre « ${chapterSlug} » n'appartient à aucun module public : ajouter le chapitre à la taxonomie avant de publier`
    );
    this.name = "UnknownChapterError";
  }
}

export interface BuildSnapshotInput {
  draft: ContentDraft;
  publishedBy: string;
  publishedAt: string;
  publicationVersion: number;
  previousPublishedVersionId: string | null;
}

export function buildPublishedVersion(input: BuildSnapshotInput): PublishedContentVersion {
  const draft = input.draft;
  const chapter = resolvePublicChapter(draft.chapterSlug);

  if (!chapter) {
    throw new UnknownChapterError(draft.chapterSlug);
  }

  // LE CONTENU EST NETTOYE AVANT D'ETRE RECOPIE. Les references imbriquees du
  // contenu — sur chaque regle, chaque formule, chaque etape — portent leur
  // propre `excerpt`. Sans ce retrait, le texte des PDF prives partait dans le
  // fichier commite, dans la base, et dans la charge utile RSC de la fiche.
  const payload = contentPayloadSchema.parse(
    stripSourceExcerpts({ contentType: draft.contentType, content: draft.content })
  );

  const remaining = findRemainingExcerptPaths(payload, "content");

  if (remaining.length > 0) {
    throw new Error(
      `nettoyage incomplet : ${remaining.join(", ")} porte encore du texte de source`
    );
  }

  const key: PublicationKey = {
    artifactType: draft.contentType,
    chapter: chapter.slug,
    slug: resolveSlug(draft)
  };

  const validation = draft.validationMetadata;

  if (!validation?.passed) {
    // Défensif : le garde a déjà refusé ce cas. Construire un instantané qui
    // annonce `passed: true` alors que la validation stockée dit le contraire
    // fabriquerait une preuve fausse, ce qui est pire que refuser.
    throw new Error(
      "impossible de construire un instantané : la validation stockée n'est pas favorable"
    );
  }

  return publishedContentVersionSchema.parse({
    id: publicationVersionId(key, input.publicationVersion),
    sourceArtifactId: draft.id,
    artifactType: key.artifactType,
    title: draft.title,
    slug: key.slug,
    domain: draft.domainId,
    module: COMPTA_APPROFONDIE_MODULE,
    chapter: key.chapter,
    chapterLabel: chapter.label,
    contentSnapshot: payload,
    normativeContextSnapshot: draft.normativeContext ?? null,
    sourceReferencesSnapshot: collectPublishedReferences(draft),
    publicationVersion: input.publicationVersion,
    publishedAt: input.publishedAt,
    publishedBy: input.publishedBy,
    generationMetadataSnapshot: {
      provider: draft.generationMetadata.provider,
      model: draft.generationMetadata.model,
      promptId: draft.generationMetadata.promptId,
      promptVersion: draft.generationMetadata.promptVersion,
      generatedAt: draft.generationMetadata.generatedAt,
      inputHash: draft.generationMetadata.inputHash,
      sourcePackId: draft.generationMetadata.sourcePackId,
      documentIds: draft.generationMetadata.documentIds,
      mode: draft.generationMetadata.mode
    },
    validationMetadataSnapshot: {
      passed: true,
      validationVersion: validation.validationVersion,
      validatedAt: validation.validatedAt,
      qualityScore: validation.qualityScore,
      warningCodes: [...new Set(validation.warnings.map((warning) => warning.code))].sort()
    },
    reviewMetadataSnapshot: {
      reviewedBy: draft.reviewMetadata.reviewedBy,
      reviewedAt: draft.reviewMetadata.reviewedAt,
      revision: draft.reviewMetadata.revision
    },
    contentHash: contentHash(payload),
    status: "published",
    previousPublishedVersionId: input.previousPublishedVersionId,
    archivedAt: null
  });
}
