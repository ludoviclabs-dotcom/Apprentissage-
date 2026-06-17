import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";
import { submitExamAnswers } from "@finance/db";
import { z } from "zod";

const submitExamSchema = z.object({
  answers: z.array(
    z.object({
      exerciseId: z.string().min(1),
      userAnswer: z.string().min(12)
    })
  )
});

export async function POST(request: Request) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  const body = submitExamSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid exam submission", details: body.error.flatten() }, { status: 400 });
  }

  const result = await submitExamAnswers(body.data.answers);

  return Response.json(result);
}
