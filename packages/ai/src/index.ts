import type { Correction, Exercise, Lesson, SourceReference } from "@finance/domain";

export type AiProviderName = "none" | "openai" | "anthropic" | "ollama";

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiProvider {
  name: AiProviderName;
  complete(messages: AiMessage[]): Promise<string>;
}

export interface RetrievalResult {
  content: string;
  source: SourceReference;
  confidence: number;
}

export interface TutorAgentInput {
  question: string;
  mode: "reprise" | "expert-comptable" | "entretien" | "cas-pratique" | "socratique";
  retrieval: RetrievalResult[];
}

export interface TutorAgentOutput {
  answer: string;
  reasoningSteps: string[];
  sources: SourceReference[];
}

export interface ExerciseGeneratorOutput {
  exercise: Exercise;
  lesson: Pick<Lesson, "concept" | "rule" | "reasoning" | "example" | "frequentError">;
}

export interface CorrectorAgentOutput {
  correction: Correction;
  nextReviewPrompt: string;
}

export class DisabledAiProvider implements AiProvider {
  name: AiProviderName = "none";

  async complete(): Promise<string> {
    return "AI provider disabled. The MVP uses seeded learning flows until a provider is configured.";
  }
}

export function assertHasSources(sources: SourceReference[]) {
  if (sources.length === 0) {
    throw new Error("A sourced learning answer requires at least one source reference.");
  }
}

export function createTutorResponse(input: TutorAgentInput): TutorAgentOutput {
  const sources = input.retrieval.map((item) => item.source);
  assertHasSources(sources);

  const strongest = [...input.retrieval].sort((left, right) => right.confidence - left.confidence)[0];

  return {
    answer: `Réponse guidée : ${strongest.content}`,
    reasoningSteps: [
      "Identifier la matière et le niveau attendu.",
      "Retrouver les passages sources les plus proches.",
      "Expliquer la règle, puis l'appliquer à un exemple.",
      "Séparer cours, référence officielle et note personnelle."
    ],
    sources
  };
}

export function createSourceAudit(retrieval: RetrievalResult[]) {
  return {
    sourceCount: retrieval.length,
    hasOfficialReference: retrieval.some((item) => item.source.sourceType === "official-reference"),
    hasPersonalNotes: retrieval.some((item) => item.source.sourceType === "personal-note"),
    averageConfidence:
      retrieval.length === 0
        ? 0
        : Math.round((retrieval.reduce((sum, item) => sum + item.confidence, 0) / retrieval.length) * 100) / 100
  };
}
