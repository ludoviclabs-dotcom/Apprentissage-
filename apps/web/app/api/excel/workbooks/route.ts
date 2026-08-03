import { InvalidWorkbookDraftError, saveWorkbookDraft } from "@finance/db";
import { getRequiredEntitlement } from "@finance/domain";
import { getCurrentUser, resolveWriteUser } from "@/lib/auth/current-user";
import { guardEntitlement } from "@/lib/billing/entitlements";
import { getExerciseAccess } from "@/lib/learning-progression";
import { getLabExercise } from "@/lib/excel-lab";
import { z } from "zod";

/**
 * Saving a grid draft (PR-12b).
 *
 * A draft is work in progress, not an attempt: nothing here grades, nothing
 * here touches progression. It is accepted only when the database is active
 * and a user can be attributed — the same `resolveWriteUser` gate as an
 * attempt — and only for a lab exercise that actually exists, behind the same
 * paywall as its page: a draft body would otherwise be a free way to exercise
 * premium content ids.
 */

const draftSchema = z.object({
  exerciseId: z.string().min(1),
  // Same bounds as a submission: 40 cells, short inputs. The value is the raw
  // text as typed — `"=SOMME(B2:B10)"` or `"636000"` — never a computed result.
  cells: z
    .record(z.string().regex(/^[A-Za-z]{1,3}\d{1,4}$/), z.string().max(200))
    .refine((cells) => Object.keys(cells).length <= 40, {
      message: "Trop de cellules dans le brouillon."
    })
});

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = draftSchema.safeParse(payload);

  if (!body.success) {
    return Response.json({ error: "Brouillon invalide", details: body.error.flatten() }, { status: 400 });
  }

  if (!getLabExercise(body.data.exerciseId)) {
    return Response.json({ error: "Exercice introuvable" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  const levelAccess = await getExerciseAccess({
    userId: currentUser?.id,
    exerciseId: body.data.exerciseId
  });

  if (!levelAccess.allowed) {
    return Response.json({ error: "Niveau verrouillé" }, { status: 403 });
  }

  const requiredEntitlement = getRequiredEntitlement(body.data.exerciseId);

  if (requiredEntitlement) {
    const gate = await guardEntitlement(requiredEntitlement);

    if (gate.response) {
      return gate.response;
    }
  }

  const writer = await resolveWriteUser();

  if (writer.response) {
    return writer.response;
  }

  if (!writer.userId) {
    // No database, or nobody to attribute the draft to: not an error, just a
    // configuration in which drafts do not exist.
    return Response.json({ saved: false, reason: "database-disabled" });
  }

  try {
    const result = await saveWorkbookDraft(writer.userId, body.data.exerciseId, body.data.cells);

    return Response.json(result);
  } catch (error) {
    if (error instanceof InvalidWorkbookDraftError) {
      return Response.json({ error: "Brouillon invalide", details: error.message }, { status: 400 });
    }

    return Response.json(
      {
        error: "Enregistrement impossible",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      },
      { status: 500 }
    );
  }
}
