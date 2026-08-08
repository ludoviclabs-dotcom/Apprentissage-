import { contentPayloadSchema, contentTypeSchema, normativeContextSchema } from "@finance/content-generation";
import { z } from "zod";

/**
 * Une version publiée : un instantané immuable d'un contenu approuvé.
 *
 * IMMUABLE VEUT DIRE QUE PERSONNE NE LE RÉÉCRIT, PAS QUE PERSONNE N'ESSAIE.
 * Le contenu est *recopié* ici, pas référencé. Reprendre le brouillon après
 * publication — le régénérer, le corriger, l'archiver — ne touche rien de ce
 * qu'un visiteur a lu : il faudrait publier une nouvelle version, qui porte un
 * nouvel identifiant et archive l'ancienne. C'est la seule construction qui rende
 * la phrase « le site public ne lit que du contenu approuvé » vraie au moment de
 * la lecture, et pas seulement au moment de la publication.
 *
 * LES EXTRAITS SOURCES NE SONT PAS RECOPIÉS. `sourceReferencesSnapshot` retient
 * de quoi *désigner* une source — pack, document, nature, pages, section — et
 * jamais son texte. Les extraits proviennent de PDF privés ; les recopier dans un
 * fichier commité les publierait, ce qu'aucune approbation n'autorise. Ce que le
 * panneau « Sources » affiche est donc une désignation vérifiable, pas une
 * citation.
 */

export const publicationStatuses = ["published", "archived"] as const;

export type PublicationStatus = (typeof publicationStatuses)[number];

export const publicationStatusSchema = z.enum(publicationStatuses);

/**
 * Référence de source telle qu'elle survit à la publication.
 *
 * Reprend `sourceReferenceSchema` de la fabrique **moins** `excerpt` et
 * `excerptHash` : le premier est du texte privé, le second n'a de sens que
 * confronté au corpus, qui n'existe pas là où le site public s'exécute. Les
 * `chunkIds` restent : ce sont des identifiants internes opaques, et c'est par
 * eux qu'un relecteur retrouve le fragment exact sur la machine qui détient le
 * corpus.
 */
export const publishedSourceReferenceSchema = z.object({
  pack: z.string().min(1),
  documentId: z.string().min(1),
  documentTitle: z.string().min(1),
  sourceType: z.enum(["course", "official-reference", "personal-note", "exercise"]),
  effectiveDate: z.string().min(1).optional(),
  pageStart: z.number().int().min(1),
  pageEnd: z.number().int().min(1),
  chunkIds: z.array(z.string().min(1)).min(1),
  sectionTitle: z.string().optional()
});

export type PublishedSourceReference = z.infer<typeof publishedSourceReferenceSchema>;

/**
 * Métadonnées de génération conservées à la publication.
 *
 * `mode` est le champ qui compte : un contenu produit en `mock` ne peut pas
 * atteindre le site public, et le garde le refuse. Il est recopié malgré tout,
 * pour qu'un audit puisse constater sur pièce que la version servie ne vient pas
 * d'une fixture. La clé d'API n'a jamais existé dans cette structure.
 */
export const publishedGenerationMetadataSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptId: z.string().min(1),
  promptVersion: z.string().min(1),
  generatedAt: z.string().min(1),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePackId: z.string().min(1),
  documentIds: z.array(z.string().min(1)),
  mode: z.enum(["mock", "live"])
});

export const publishedValidationMetadataSchema = z.object({
  passed: z.literal(true),
  validationVersion: z.string().min(1),
  validatedAt: z.string().min(1),
  qualityScore: z.number().int().min(0).max(100),
  warningCodes: z.array(z.string().min(1))
});

export const publishedReviewMetadataSchema = z.object({
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  revision: z.number().int().min(1)
});

export const publishedContentVersionSchema = z.object({
  /** `pub-<artifactType>-<slug>-v<n>` — lisible dans un diff, stable, sans hasard. */
  id: z.string().min(1),
  /** Le brouillon dont ceci est l'instantané. Ne conditionne aucune lecture publique. */
  sourceArtifactId: z.string().min(1),
  artifactType: contentTypeSchema,
  title: z.string().min(1),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  domain: z.string().min(1),
  module: z.string().min(1),
  chapter: z.string().min(1),
  chapterLabel: z.string().min(1),
  /** Le contenu lui-même, discriminé par `artifactType`, recopié tel quel. */
  contentSnapshot: contentPayloadSchema,
  /**
   * Le référentiel selon lequel l'instantané dit vrai, recopié comme le reste.
   *
   * IL DÉCIDE DE LA NOTATION APRÈS LA PUBLICATION. Un contenu
   * « comparaison seule » ne corrige aucune tentative et ne compte dans aucun
   * score : le laisser derrière dans le brouillon aurait obligé chaque page
   * publique à interroger la fabrique pour savoir si elle a le droit de noter,
   * ce que l'architecture interdit — le site public ne lit que des instantanés.
   *
   * Facultatif pour la même raison que dans l'enveloppe : les versions publiées
   * avant ce champ restent lisibles. `resolveNormativeContext` fournit alors le
   * référentiel courant, qui était le comportement implicite d'avant.
   */
  normativeContextSnapshot: normativeContextSchema.nullish(),
  sourceReferencesSnapshot: z.array(publishedSourceReferenceSchema).min(1),
  /** 1 pour la première publication, incrémentée à chaque nouvelle version. */
  publicationVersion: z.number().int().min(1),
  publishedAt: z.string().min(1),
  publishedBy: z.string().min(1),
  generationMetadataSnapshot: publishedGenerationMetadataSchema,
  validationMetadataSnapshot: publishedValidationMetadataSchema,
  reviewMetadataSnapshot: publishedReviewMetadataSchema,
  /** SHA-256 du contenu canonique. Recalculé à la lecture par les tests. */
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: publicationStatusSchema,
  /** Renseigné dès la deuxième version ; jamais effacé quand elle est archivée. */
  previousPublishedVersionId: z.string().min(1).nullable(),
  /** Horodatage de l'archivage. Null tant que la version est active. */
  archivedAt: z.string().min(1).nullable()
});

export type PublishedContentVersion = z.infer<typeof publishedContentVersionSchema>;

/**
 * L'identité logique d'un contenu publié, indépendante de sa version.
 *
 * Une seule version peut être `published` par triplet ; toutes les autres sont
 * `archived`. C'est cette contrainte qui fait qu'une page publique n'a jamais à
 * choisir entre deux candidates.
 */
export interface PublicationKey {
  artifactType: PublishedContentVersion["artifactType"];
  chapter: string;
  slug: string;
}

export function publicationKeyOf(version: PublishedContentVersion): PublicationKey {
  return { artifactType: version.artifactType, chapter: version.chapter, slug: version.slug };
}

export function serializePublicationKey(key: PublicationKey): string {
  return `${key.artifactType}::${key.chapter}::${key.slug}`;
}

export function publicationVersionId(key: PublicationKey, version: number): string {
  return `pub-${key.artifactType.replace(/_/g, "-")}-${key.chapter}-${key.slug}-v${version}`;
}
