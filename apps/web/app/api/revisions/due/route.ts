import { getRemediationTasks, getReviewQueue } from "@finance/db";
import { resolveReadUser } from "@/lib/auth/current-user";

/**
 * The review session: what is due, and what the learner owes themselves.
 *
 * The payload carries prompts only. An answer is obtainable exclusively through
 * `POST /api/revisions/reveal`, so nothing a client receives here can display the
 * back of a card before the learner has asked for it.
 */
export async function GET() {
  const reader = await resolveReadUser();

  if (reader.response) {
    return reader.response;
  }

  const [queue, remediations] = await Promise.all([
    getReviewQueue(reader.userId),
    getRemediationTasks(reader.userId)
  ]);

  return Response.json({ queue, remediations });
}
