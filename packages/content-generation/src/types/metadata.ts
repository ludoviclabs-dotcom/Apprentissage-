import { z } from "zod";
import { generationModeSchema } from "./generation-mode";
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
 * Les modes de génération vivent dans leur propre module, et sont réexportés ici
 * pour que les appelants historiques — la CLI, les fournisseurs, les tests — ne
 * changent pas d'import. La définition, elle, n'existe qu'à un seul endroit :
 * `./generation-mode`, atteignable sans `node:fs` par le schéma de publication
 * comme par un îlot client.
 */
export * from "./generation-mode";

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
  mode: generationModeSchema,
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
