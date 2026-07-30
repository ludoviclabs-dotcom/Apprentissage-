import { ACTIVITY_KINDS } from "@finance/domain";
import { MasteryLevelNotAvailableError, recordMasteryEvent, refreshTrackProgress } from "@finance/db";
import { z } from "zod";
import { resolveWriteUser } from "@/lib/auth/current-user";
import { getFeatures } from "@/lib/features";

/**
 * Records the outcome of one activity against a level.
 *
 * Every learning activity funnels through here rather than computing progress of
 * its own: the level score, the unlock decision and the snapshot are all derived
 * server-side from the stored events, so no client can grant itself a level.
 */

const KINDS = [...ACTIVITY_KINDS, "finalDiagnostic"] as const;

const masteryEventSchema = z.object({
  levelId: z.string().min(1),
  kind: z.enum(KINDS),
  scorePercent: z.number().min(0).max(100),
  sourceRef: z.string().min(1).max(200).optional()
});

export async function POST(request: Request) {
  const writer = await resolveWriteUser();

  if (writer.response) {
    return writer.response;
  }

  if (!writer.userId) {
    const features = getFeatures();

    // The endpoint exists to persist. Silently accepting and dropping the event
    // would report progress the learner does not actually have.
    return Response.json(
      { error: "Progression non enregistrable", details: features.persistence.reason },
      { status: 501 }
    );
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = masteryEventSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Évènement de maîtrise invalide", details: body.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const trackId = await recordMasteryEvent(writer.userId, body.data);
    const snapshots = await refreshTrackProgress(writer.userId, trackId);

    return Response.json({ trackId, snapshots }, { status: 201 });
  } catch (error) {
    if (error instanceof MasteryLevelNotAvailableError) {
      return Response.json({ error: "Niveau indisponible", details: error.message }, { status: 400 });
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
