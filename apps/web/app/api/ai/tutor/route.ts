import { createSourceAudit, createTutorResponse } from "@finance/ai";
import { lessons } from "@finance/domain";
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
  const retrieval = lesson.sourceReferences.map((source, index) => ({
    content: index === 0 ? lesson.rule : lesson.reasoning,
    source,
    confidence: index === 0 ? 0.88 : 0.74
  }));

  const response = createTutorResponse({
    question: body.data.question,
    mode: body.data.mode,
    retrieval
  });

  return Response.json({
    ...response,
    audit: createSourceAudit(retrieval)
  });
}
