import { REVIEW_ITEM_TYPES } from "@finance/domain";
import { getPublicDemoWriteResponse, getRuntimeFlags } from "@/lib/runtime-flags";
import { resolveWriteUser } from "@/lib/auth/current-user";
import { recordReviewOutcome } from "@finance/db";
import { z } from "zod";

/**
 * Recording one self-assessment.
 *
 * The demo check comes first, before the body is even read, so a write attempt
 * against the public demo is refused on the same grounds whatever it contains.
 *
 * `flashcardId` is accepted as a legacy alias for `itemRef`: the queue can now
 * schedule an exercise as well as a card, but the previous payload shape is
 * still valid and still means a flashcard.
 */

const reviewSchema = z
  .object({
    itemType: z.enum(REVIEW_ITEM_TYPES).default("flashcard"),
    itemRef: z.string().min(1).max(200).optional(),
    flashcardId: z.string().min(1).max(200).optional(),
    rating: z.enum(["forgotten", "partial", "correct", "mastered"]),
    // Self-reported, defaulting to true for the legacy payload that had no
    // notion of revealing. Stored as given: a rating recorded without a reveal
    // is weaker evidence and the log has to be able to say so.
    revealed: z.boolean().default(true)
  })
  .refine((value) => Boolean(value.itemRef ?? value.flashcardId), {
    message: "Fournir `itemRef` ou `flashcardId`."
  });

export async function POST(request: Request) {
  if (getRuntimeFlags().publicDemo) {
    return getPublicDemoWriteResponse();
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = reviewSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Révision invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  const writer = await resolveWriteUser();

  if (writer.response) {
    return writer.response;
  }

  try {
    const result = await recordReviewOutcome(writer.userId, {
      itemType: body.data.itemType,
      itemRef: (body.data.itemRef ?? body.data.flashcardId) as string,
      rating: body.data.rating,
      revealed: body.data.revealed
    });

    if (!result) {
      return Response.json({ error: "Élément de révision introuvable" }, { status: 404 });
    }

    return Response.json(result);
  } catch (error) {
    // A migrated-but-unseeded database is the reachable case, and it used to
    // surface as a bare framework 500. `flashcard_states.flashcard_id` points at
    // `flashcards`, while `getFlashcards` falls back to the in-memory seed when
    // that table is empty — so the card renders, and only the write finds out it
    // does not exist. The learner gets the actual remedy instead of a stack.
    return Response.json(
      {
        error: "Révision non enregistrée",
        details:
          error instanceof Error
            ? `${error.message} — si la base est active mais vide, lance \`pnpm db:seed\`.`
            : "Erreur inconnue"
      },
      { status: 500 }
    );
  }
}
