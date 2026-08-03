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

/**
 * A spreadsheet cell carries a value, a formula, or both — but not neither: an
 * entry with nothing in it says the same as an absent key, and accepting it
 * would let a payload claim cells the learner never filled.
 */
const spreadsheetCellSchema = z
  .object({
    value: z.number().finite().optional(),
    // Bounded: a formula is a line of text, and the field is echoed back in
    // feedback, so there is no reason to accept an essay here.
    formula: z.string().max(200).optional()
  })
  .refine((cell) => cell.value !== undefined || (cell.formula ?? "").trim() !== "", {
    message: "Une cellule doit porter une valeur ou une formule."
  });

const submissionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(20000) }),
  z.object({ kind: z.literal("numeric"), value: z.number().finite() }),
  z.object({ kind: z.literal("choice"), selectedOptionIds: z.array(z.string().min(1)).max(40) }),
  z.object({ kind: z.literal("journal"), lines: z.array(journalLineSchema).min(1).max(40) }),
  z.object({
    kind: z.literal("spreadsheet"),
    cells: z
      .record(z.string().regex(/^[A-Za-z]{1,3}\d{1,4}$/), spreadsheetCellSchema)
      .refine((cells) => Object.keys(cells).length > 0, {
        message: "Aucune cellule saisie."
      })
      // Bounded like the choice and journal payloads above. The largest
      // authored grid grades two cells; without a cap a direct client could
      // post thousands of valid references, and `renderSubmission` would
      // materialise, sort and store the lot in `attempts.user_answer`.
      .refine((cells) => Object.keys(cells).length <= 40, {
        message: "Trop de cellules soumises."
      })
  })
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
      exerciseVersionId: graded.exerciseVersionId,
      // What the mark did to the review schedule. Returned so the learner is
      // told the exercise is coming back, and when: a submission that silently
      // enqueues a retest is an effect they cannot see.
      review: graded.review,
      // Same reasoning for progression: a level that did not move because the
      // database predates the module's curriculum must say so rather than look
      // like a level the answer did not deserve.
      progress: graded.progress
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
