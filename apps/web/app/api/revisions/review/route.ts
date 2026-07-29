import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";
import { resolveWriteUser } from "@/lib/auth/current-user";
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

  const writer = await resolveWriteUser();

  if (writer.response) {
    return writer.response;
  }

  const review = await reviewFlashcard(writer.userId ?? "", body.data.flashcardId, body.data.rating);

  return Response.json({ review });
}
