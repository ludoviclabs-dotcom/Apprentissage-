import { createAiProviderFromEnv } from "@finance/ai";
import type { GenerationMode } from "../types/metadata";
import { LiveContentProvider } from "./live";
import { ManualAssistedContentProvider, type ManualAssistedOptions } from "./manual-assisted";
import { MockContentProvider } from "./mock";
import type { ContentGenerationProvider } from "./types";

export * from "./types";
export { MockContentProvider } from "./mock";
export { LiveContentProvider } from "./live";
export * from "./manual-assisted";
export * from "./fixture-helpers";

export interface ContentAiEnv {
  CONTENT_AI_ENABLED?: string;
  CONTENT_AI_PROVIDER?: string;
  CONTENT_AI_MODEL?: string;
  CONTENT_AI_MAX_INPUT_CHARS?: string;
  CONTENT_AI_MAX_RETRIES?: string;
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

export const DEFAULT_MAX_RETRIES = 2;

export class LiveProviderUnavailableError extends Error {
  constructor(reason: string) {
    super(
      `génération live indisponible : ${reason}. ` +
        "Le mode mock reste utilisable sans configuration : ajouter --mode mock."
    );
    this.name = "LiveProviderUnavailableError";
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveMaxInputChars(env: ContentAiEnv, fallback: number): number {
  return parsePositiveInt(env.CONTENT_AI_MAX_INPUT_CHARS, fallback);
}

/**
 * Sélection du provider.
 *
 * Le mode mock est le défaut absolu : il faut demander « live » *et* avoir posé
 * `CONTENT_AI_ENABLED=true` pour qu'un appel externe devienne possible. Une
 * configuration incomplète lève une erreur explicite plutôt que de retomber
 * silencieusement sur le mock — un opérateur qui croit générer en live doit
 * l'apprendre tout de suite.
 */
export function createContentProvider(
  requestedMode: GenerationMode,
  env: ContentAiEnv,
  manual?: ManualAssistedOptions
): ContentGenerationProvider {
  if (requestedMode === "mock") {
    return new MockContentProvider();
  }

  if (requestedMode === "manual-assisted") {
    if (!manual) {
      throw new LiveProviderUnavailableError(
        "le mode manual-assisted exige une racine de contenus rédigés et un auteur"
      );
    }

    return new ManualAssistedContentProvider(manual);
  }

  if (env.CONTENT_AI_ENABLED !== "true") {
    throw new LiveProviderUnavailableError("CONTENT_AI_ENABLED n'est pas à \"true\"");
  }

  const providerName = env.CONTENT_AI_PROVIDER ?? env.AI_PROVIDER ?? "none";

  if (providerName === "mock" || providerName === "none") {
    throw new LiveProviderUnavailableError(
      `CONTENT_AI_PROVIDER vaut « ${providerName} » — aucun fournisseur réel n'est désigné`
    );
  }

  const ai = createAiProviderFromEnv({
    AI_PROVIDER: providerName,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_MODEL: env.CONTENT_AI_MODEL ?? env.OPENAI_MODEL,
    OLLAMA_BASE_URL: env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: env.CONTENT_AI_MODEL ?? env.OLLAMA_MODEL
  });

  if (ai.name === "none") {
    throw new LiveProviderUnavailableError(
      `le fournisseur « ${providerName} » n'est pas configuré (clé ou URL manquante)`
    );
  }

  const model = env.CONTENT_AI_MODEL ?? env.OPENAI_MODEL ?? env.OLLAMA_MODEL ?? "modele-non-precise";

  return new LiveContentProvider(ai, model, parsePositiveInt(env.CONTENT_AI_MAX_RETRIES, DEFAULT_MAX_RETRIES));
}
