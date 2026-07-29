import { createAiProviderFromEnv, createSourceAudit, createTutorMessages, createTutorResponse } from "@finance/ai";
import { lessons } from "@finance/domain";
import { searchKnowledge } from "@finance/db";
import { getEnv } from "@/lib/env";
import { z } from "zod";

/** `disabled`: no provider configured. `failed`: provider configured but errored. */
export type TutorProviderStatus = "ok" | "disabled" | "failed";

const tutorRequestSchema = z.object({
  question: z.string().min(4),
  mode: z.enum(["reprise", "expert-comptable", "entretien", "cas-pratique", "socratique"]).default("reprise")
});

export async function POST(request: Request) {
  const body = tutorRequestSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid tutor request", details: body.error.flatten() }, { status: 400 });
  }

  const lesson = lessons[0];
  const knowledgeHits = await searchKnowledge(body.data.question);
  const retrieval =
    knowledgeHits.length > 0
      ? knowledgeHits
      : lesson.sourceReferences.map((source, index) => ({
          content: index === 0 ? lesson.rule : lesson.reasoning,
          source,
          confidence: index === 0 ? 0.88 : 0.74
        }));

  const response = createTutorResponse({
    question: body.data.question,
    mode: body.data.mode,
    retrieval
  });
  const env = getEnv();
  const provider = createAiProviderFromEnv({
    AI_PROVIDER: env.AI_PROVIDER,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OLLAMA_BASE_URL: env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: env.OLLAMA_MODEL
  });
  let providerAnswer: string | null = null;
  let providerStatus: TutorProviderStatus = provider.name === "none" ? "disabled" : "ok";

  if (provider.name !== "none") {
    try {
      providerAnswer = await provider.complete(
        createTutorMessages({
          question: body.data.question,
          mode: body.data.mode,
          retrieval
        })
      );
    } catch {
      // The seeded answer below is still cited and usable, but the caller must be
      // told the provider failed instead of silently believing it answered.
      providerAnswer = null;
      providerStatus = "failed";
    }
  }

  return Response.json({
    ...response,
    answer: providerAnswer ?? response.answer,
    provider: provider.name,
    providerStatus,
    audit: createSourceAudit(retrieval)
  });
}
