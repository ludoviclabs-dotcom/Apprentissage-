import { createHash } from "node:crypto";
import type { z } from "zod";
import type { SourceEnvelope } from "../envelope/build";
import type { GenerationMode } from "../types/metadata";
import type { PromptDefinition } from "../prompts/registry";

/**
 * Contrat de génération, indépendant de tout fournisseur.
 *
 * Le provider rend un objet **déjà validé** par le schéma qu'on lui a passé, ou
 * un échec explicite. Aucun appelant ne reçoit de JSON non typé.
 */

export interface GenerationRequest<T> {
  schema: z.ZodType<T>;
  prompt: PromptDefinition;
  /** Consigne concrète (« produis 10 flashcards sur ce chapitre »). */
  instruction: string;
  envelope: SourceEnvelope;
  /** Repère libre pour les journaux ; jamais un secret. */
  label: string;
}

export interface GenerationSuccess<T> {
  ok: true;
  data: T;
  model: string;
  mode: GenerationMode;
  repairAttempts: number;
}

export interface GenerationFailure {
  ok: false;
  /** Message destiné à l'opérateur ; ne contient ni clé ni corps de requête. */
  error: string;
  model: string;
  mode: GenerationMode;
  repairAttempts: number;
}

export type GenerationResult<T> = GenerationSuccess<T> | GenerationFailure;

export interface ContentGenerationProvider {
  readonly name: string;
  readonly model: string;
  readonly mode: GenerationMode;
  generateStructuredContent<T>(request: GenerationRequest<T>): Promise<GenerationResult<T>>;
}

/**
 * Empreinte de génération : enveloppe + prompt + consigne. Deux générations de
 * même empreinte ont reçu exactement les mêmes entrées, ce qui rend une
 * régénération comparable et détecte qu'une source a bougé.
 */
export function computeInputHash(request: GenerationRequest<unknown>): string {
  return createHash("sha256")
    .update(
      [
        request.envelope.inputHash,
        `${request.prompt.id}.${request.prompt.version}`,
        request.instruction
      ].join("\n")
    )
    .digest("hex");
}

/**
 * Extrait un objet JSON d'une réponse de modèle. Tolère les clôtures Markdown
 * qu'un modèle ajoute malgré la consigne, mais ne « répare » rien d'autre :
 * au-delà, on préfère une nouvelle tentative à une devinette.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidate = withoutFence.length > 0 ? withoutFence : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Dernier recours : le premier objet complet du texte.
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1));
    }

    throw new Error("la réponse ne contient pas d'objet JSON exploitable");
  }
}
