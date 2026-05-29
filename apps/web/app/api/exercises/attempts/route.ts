import { exercises } from "@finance/domain";
import { gradeExercise, recordAttempt } from "@finance/db";
import { z } from "zod";

const attemptSchema = z.object({
  exerciseId: z.string().min(1),
  userAnswer: z.string().min(12)
});

export async function POST(request: Request) {
  const body = attemptSchema.safeParse(await request.json());

  if (!body.success) {
    return Response.json({ error: "Invalid attempt", details: body.error.flatten() }, { status: 400 });
  }

  const exercise = exercises.find((item) => item.id === body.data.exerciseId);

  if (!exercise) {
    return Response.json({ error: "Exercise not found" }, { status: 404 });
  }

  const correction = gradeExercise(exercise, body.data.userAnswer);
  await recordAttempt(exercise.id, body.data.userAnswer, correction);

  return Response.json({ correction });
}
