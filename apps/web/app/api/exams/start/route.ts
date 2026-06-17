import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";
import { startExam } from "@finance/db";
import { z } from "zod";

const startExamSchema = z.object({
  examId: z.string().min(1)
});

export async function POST(request: Request) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  const body = startExamSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid exam start request", details: body.error.flatten() }, { status: 400 });
  }

  const session = await startExam(body.data.examId);

  return Response.json({ session });
}
