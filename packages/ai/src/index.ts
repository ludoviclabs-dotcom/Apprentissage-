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

export class OpenAiProvider implements AiProvider {
  name: AiProviderName = "openai";

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async complete(messages: AiMessage[]): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI provider failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    return payload.choices?.[0]?.message?.content ?? "";
  }
}

export class OllamaProvider implements AiProvider {
  name: AiProviderName = "ollama";

  constructor(
    private readonly baseUrl: string,
    private readonly model: string
  ) {}

  async complete(messages: AiMessage[]): Promise<string> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama provider failed with ${response.status}`);
    }

    const payload = (await response.json()) as { message?: { content?: string } };
    return payload.message?.content ?? "";
  }
}

export interface AiProviderEnv {
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OLLAMA_BASE_URL?: string;
  OLLAMA_MODEL?: string;
}

export function createAiProviderFromEnv(env: AiProviderEnv): AiProvider {
  if (env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY) {
    return new OpenAiProvider(env.OPENAI_API_KEY, env.OPENAI_MODEL ?? "gpt-4.1-mini");
  }

  if (env.AI_PROVIDER === "ollama") {
    return new OllamaProvider(env.OLLAMA_BASE_URL ?? "http://localhost:11434", env.OLLAMA_MODEL ?? "llama3.1");
  }

  return new DisabledAiProvider();
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

export function createTutorMessages(input: TutorAgentInput): AiMessage[] {
  const sourceBlock = input.retrieval
    .map((item, index) => {
      const page = item.source.pageStart ? `p.${item.source.pageStart}` : "page non renseignee";
      return `[S${index + 1}] ${item.source.pack} / ${item.source.document} / ${page} / ${item.source.effectiveDate ?? "date non renseignee"}\n${item.content}`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "Tu es un tuteur finance/comptabilite. Reponds en francais. Structure toujours en concept, regle, raisonnement, exemple, erreur frequente, exercice lie. Cite uniquement les sources fournies."
    },
    {
      role: "user",
      content: `Mode: ${input.mode}\nQuestion: ${input.question}\n\nSources:\n${sourceBlock}`
    }
  ];
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
