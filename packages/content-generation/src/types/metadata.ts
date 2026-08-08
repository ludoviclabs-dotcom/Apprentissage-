import { z } from "zod";
import { normativeContextSchema } from "./normative-context";
import { contentDraftStatusSchema, statusTransitionSchema } from "./status";

/**
 * Métadonnées transverses d'un brouillon : d'où il vient, ce que les contrôles
 * en ont dit, ce que le relecteur en a fait.
 *
 * Aucune de ces structures ne porte de clé d'API : `generationMetadata` nomme le
 * fournisseur et le modèle, jamais le secret qui a servi à les joindre.
 */

/**
 * Trois provenances, et une seule frontière qui compte.
 *
 * - `mock` : une fixture technique. Elle sert à exercer la chaîne sans réseau et
 *   n'est du contenu pédagogique en aucun sens. **Impubliable, définitivement.**
 * - `live` : un modèle a rédigé le brouillon à partir de l'enveloppe de sources.
 * - `manual-assisted` : le brouillon a été rédigé à partir des extraits validés,
 *   sans appel à un fournisseur, puis soumis **aux mêmes** contrôles
 *   déterministes et à la **même** approbation humaine que `live`.
 *
 * `manual-assisted` n'est donc pas un `mock` renommé, et la distinction n'est pas
 * déclarative : une fixture est choisie par `prompt.id` dans un catalogue
 * compilé dans le dépôt, tandis qu'un contenu assisté est lu d'un fichier
 * d'entrée hors Git, écrit pour ce chapitre-là, et refusé s'il n'existe pas. Les
 * deux modes ne peuvent pas produire le même octet par accident.
 *
 * Ce qui autorise la publication est l'approbation humaine, pas le mode ; ce que
 * le mode décide est seulement s'il existe un chemin vers cette approbation. Le
 * mock n'en a aucun.
 */
export const generationModes = ["mock", "live", "manual-assisted"] as const;
export type GenerationMode = (typeof generationModes)[number];

/** Les modes qu'une publication peut accepter, une fois l'humain passé. */
export const publishableGenerationModes = ["live", "manual-assisted"] as const;

export function isPublishableGenerationMode(mode: string): boolean {
  return (publishableGenerationModes as readonly string[]).includes(mode);
}

export const generationMetadataSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  promptId: z.string().min(1),
  promptVersion: z.string().regex(/^v\d+$/, "version de prompt attendue sous la forme v1, v2, …"),
  generatedAt: z.string().min(1),
  /**
   * Empreinte des entrées (enveloppe + prompt + schéma). Deux générations de
   * même empreinte ont vu exactement la même chose : c'est ce qui permet de
   * détecter qu'une source a bougé sous un brouillon.
   */
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePackId: z.string().min(1),
  documentIds: z.array(z.string().min(1)).min(1),
  chunkIds: z.array(z.string().min(1)),
  mode: z.enum(generationModes),
  /** Nombre de réparations JSON qu'il a fallu pour obtenir une sortie valide. */
  repairAttempts: z.number().int().min(0).default(0)
});

export type GenerationMetadata = z.infer<typeof generationMetadataSchema>;

export const validationIssueSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  /** Chemin dans le contenu (`flashcards.2.front`), pour pointer l'endroit exact. */
  path: z.string().optional(),
  severity: z.enum(["error", "warning"])
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationMetadataSchema = z.object({
  passed: z.boolean(),
  validationVersion: z.string().min(1),
  validatedAt: z.string().min(1),
  errors: z.array(validationIssueSchema),
  warnings: z.array(validationIssueSchema),
  /** 0 à 100. Indicatif pour trier la file de revue, jamais un droit à publier. */
  qualityScore: z.number().int().min(0).max(100),
  /** Ce qui interdit précisément le passage en revue. Vide si `passed`. */
  blockingReasons: z.array(z.string().min(1))
});

export type ValidationMetadata = z.infer<typeof validationMetadataSchema>;

export const reviewMetadataSchema = z.object({
  reviewedBy: z.string().min(1).optional(),
  reviewedAt: z.string().min(1).optional(),
  /** Obligatoire au rejet — un refus sans motif est inexploitable. */
  reviewNote: z.string().max(4000).optional(),
  /** Incrémentée quand un contenu approuvé est repris : rien n'est écrasé. */
  revision: z.number().int().min(1).default(1)
});

export type ReviewMetadata = z.infer<typeof reviewMetadataSchema>;

export const contentDraftEnvelopeSchema = z.object({
  id: z.string().min(1),
  status: contentDraftStatusSchema,
  chapterSlug: z.string().min(1),
  chapterLabel: z.string().min(1),
  domainId: z.string().min(1),
  title: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  generationMetadata: generationMetadataSchema,
  validationMetadata: validationMetadataSchema.nullable(),
  /**
   * Selon quel référentiel ce contenu dit vrai.
   *
   * Facultatif, et pour une seule raison : les brouillons produits avant ce
   * champ ne le portent pas, et les invalider en bloc aurait fait basculer tout
   * un chapitre en `validation_failed` sans qu'un relecteur ait rien arbitré.
   * Le validateur avertit dès qu'un compte versionné apparaît sans lui, et le
   * classement (`classifyNormativeContext`) en propose un ; le champ deviendra
   * obligatoire quand les contenus existants l'auront reçu.
   */
  normativeContext: normativeContextSchema.nullish(),
  reviewMetadata: reviewMetadataSchema,
  history: z.array(statusTransitionSchema),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1)
});

export type ContentDraftEnvelope = z.infer<typeof contentDraftEnvelopeSchema>;
