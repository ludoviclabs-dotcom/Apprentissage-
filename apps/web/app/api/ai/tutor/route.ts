import { createAiProviderFromEnv, createSourceAudit, createTutorMessages, createTutorResponse } from "@finance/ai";
import { lessons } from "@finance/domain";
import { searchKnowledge } from "@finance/db";
import { z } from "zod";

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
  const provider = createAiProviderFromEnv({
    AI_PROVIDER: process.env.AI_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
    OLLAMA_MODEL: process.env.OLLAMA_MODEL
  });
  let providerAnswer: string | null = null;

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
      providerAnswer = null;
    }
  }

  return Response.json({
    ...response,
    answer: providerAnswer ?? response.answer,
    provider: provider.name,
    audit: createSourceAudit(retrieval)
  });
}
