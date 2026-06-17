import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";
import { reviewFlashcard } from "@finance/db";
import { z } from "zod";

const reviewSchema = z.object({
  flashcardId: z.string().min(1),
  rating: z.enum(["forgotten", "partial", "correct", "mastered"])
});

export async function POST(request: Request) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  const body = reviewSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid revision review", details: body.error.flatten() }, { status: 400 });
  }

  const review = await reviewFlashcard(body.data.flashcardId, body.data.rating);

  return Response.json({ review });
}
