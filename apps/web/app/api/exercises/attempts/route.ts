import { submitAttempt, UnsupportedSubmissionError } from "@finance/db";
import { resolveWriteUser } from "@/lib/auth/current-user";
import { z } from "zod";

/**
 * Submitting an answer.
 *
 * The payload is a discriminated union so a typed exercise can be answered in its
 * own terms — a selection, a number, journal lines — rather than as prose a
 * matcher has to guess at. `userAnswer` remains accepted and is treated as
 * `{ kind: "text" }`, so the existing form keeps working while content migrates
 * one exercise at a time.
 */

const journalLineSchema = z.object({
  account: z.string().min(1).max(40),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional()
});

const submissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("numeric"), value: z.number().finite() }),
  z.object({ kind: z.literal("choice"), selectedOptionIds: z.array(z.string().min(1)).max(40) }),
  z.object({ kind: z.literal("journal"), lines: z.array(journalLineSchema).min(1).max(40) })
]);

const attemptSchema = z
  .object({
    exerciseId: z.string().min(1),
    // Legacy shape. Kept so the current exercise form is unaffected.
    userAnswer: z.string().min(12).optional(),
    submission: submissionSchema.optional()
  })
  .refine((value) => Boolean(value.userAnswer ?? value.submission), {
    message: "Fournir `submission` ou `userAnswer`."
  });

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = attemptSchema.safeParse(payload);

  if (!body.success) {
    return Response.json({ error: "Tentative invalide", details: body.error.flatten() }, { status: 400 });
  }

  const submission = body.data.submission ?? { kind: "text" as const, text: body.data.userAnswer! };
  const writer = await resolveWriteUser();

  if (writer.response) {
    return writer.response;
  }

  try {
    // One code path for grading and persistence, shared with the golden-case
    // runner, so what CI verifies is what a learner actually gets.
    const graded = await submitAttempt({
      userId: writer.userId ?? "",
      exerciseId: body.data.exerciseId,
      payload: submission
    });

    if (!graded) {
      return Response.json({ error: "Exercice introuvable" }, { status: 404 });
    }

    return Response.json({
      correction: graded.correction,
      evaluationType: graded.evaluationType,
      exerciseVersionId: graded.exerciseVersionId
    });
  } catch (error) {
    if (error instanceof UnsupportedSubmissionError) {
      return Response.json({ error: "Format de réponse inadapté", details: error.message }, { status: 400 });
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
