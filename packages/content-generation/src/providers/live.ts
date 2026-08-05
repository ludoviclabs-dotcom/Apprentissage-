import type { AiMessage, AiProvider } from "@finance/ai";
import { renderEnvelope } from "../envelope/build";
import type { GenerationMode } from "../types/metadata";
import { extractJson, type ContentGenerationProvider, type GenerationRequest, type GenerationResult } from "./types";

/**
 * Provider live — isolé, désactivé par défaut.
 *
 * Il ne fait qu'habiller un `AiProvider` de `packages/ai` : aucun second client
 * HTTP, aucun SDK supplémentaire. Sa seule logique propre est la boucle de
 * réparation bornée, qui renvoie au modèle les erreurs de schéma constatées
 * plutôt que de deviner ce qu'il voulait dire.
 *
 * Rien ici ne journalise la clé, l'en-tête d'autorisation ni le corps brut de la
 * requête : les messages d'erreur remontés sont écrits pour un opérateur.
 */
export class LiveContentProvider implements ContentGenerationProvider {
  readonly mode: GenerationMode = "live";

  constructor(
    private readonly ai: AiProvider,
    readonly model: string,
    private readonly maxRetries: number
  ) {}

  get name(): string {
    return `live:${this.ai.name}`;
  }

  async generateStructuredContent<T>(request: GenerationRequest<T>): Promise<GenerationResult<T>> {
    const envelopeText = renderEnvelope(request.envelope);
    const messages: AiMessage[] = [
      { role: "system", content: request.prompt.systemPrompt },
      { role: "user", content: request.prompt.buildUserPrompt(envelopeText, request.instruction) }
    ];

    let repairAttempts = 0;
    let lastError = "aucune tentative effectuée";

    while (repairAttempts <= this.maxRetries) {
      let raw: string;

      try {
        raw = await this.ai.complete(messages);
      } catch (error) {
        return {
          ok: false,
          error: `le fournisseur a échoué : ${error instanceof Error ? error.message : "erreur inconnue"}`,
          model: this.model,
          mode: this.mode,
          repairAttempts
        };
      }

      let candidate: unknown;

      try {
        candidate = extractJson(raw);
      } catch (error) {
        lastError = error instanceof Error ? error.message : "réponse illisible";
        messages.push(
          { role: "assistant", content: raw.slice(0, 2000) },
          {
            role: "user",
            content: `Ta réponse n'était pas un JSON exploitable (${lastError}). Renvoie uniquement l'objet JSON demandé, sans texte autour.`
          }
        );
        repairAttempts += 1;
        continue;
      }

      const parsed = request.schema.safeParse(candidate);

      if (parsed.success) {
        return { ok: true, data: parsed.data, model: this.model, mode: this.mode, repairAttempts };
      }

      lastError = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`)
        .join(" ; ");

      messages.push(
        { role: "assistant", content: raw.slice(0, 2000) },
        {
          role: "user",
          content: `Ta réponse ne respecte pas le schéma. Corrige exactement ces points et renvoie l'objet JSON complet :\n${lastError}`
        }
      );
      repairAttempts += 1;
    }

    return {
      ok: false,
      error: `sortie non conforme après ${this.maxRetries} réparation(s) : ${lastError}`,
      model: this.model,
      mode: this.mode,
      repairAttempts
    };
  }
}
