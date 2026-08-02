import { REVIEW_ITEM_TYPES } from "@finance/domain";
import { revealReviewItem } from "@finance/db";
import { resolveReadUser } from "@/lib/auth/current-user";
import { z } from "zod";

/**
 * Revealing the answer to one review item.
 *
 * A separate request rather than a field on the queue payload. Shipping the
 * answer with the prompt and hiding it in CSS or a `<details>` would leave it in
 * the page source, where a learner can read it without deciding to — and an
 * answer read by accident is a review that measured nothing.
 *
 * This is a read: the public demo may reveal, it simply cannot record what
 * happened next. `POST` rather than `GET` only because the item is identified by
 * a two-part key, and because a revealed answer must never be cached.
 */

const revealSchema = z.object({
  itemType: z.enum(REVIEW_ITEM_TYPES).default("flashcard"),
  itemRef: z.string().min(1).max(200)
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = revealSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Demande de révélation invalide", details: body.error.flatten() },
      { status: 400 }
    );
  }

  const reader = await resolveReadUser();

  if (reader.response) {
    return reader.response;
  }

  const revealed = await revealReviewItem(reader.userId, body.data.itemType, body.data.itemRef);

  if (!revealed) {
    return Response.json({ error: "Élément de révision introuvable" }, { status: 404 });
  }

  return Response.json({ item: revealed });
}
