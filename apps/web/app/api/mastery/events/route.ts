import { ACTIVITY_KINDS, activeCurriculum } from "@finance/domain";
import { recordMasteryEvent, refreshTrackProgress } from "@finance/db";
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

/** Level ids are validated against the curriculum, not merely against a string. */
const KNOWN_LEVEL_IDS = new Set(activeCurriculum.levels.map((level) => level.id));

const masteryEventSchema = z.object({
  levelId: z.string().min(1).refine((value) => KNOWN_LEVEL_IDS.has(value), {
    message: "Unknown level id"
  }),
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

  const level = activeCurriculum.levels.find((item) => item.id === body.data.levelId);

  if (!level) {
    return Response.json({ error: "Niveau inconnu" }, { status: 404 });
  }

  try {
    await recordMasteryEvent(writer.userId, body.data);
    const snapshots = await refreshTrackProgress(writer.userId, level.trackId);

    return Response.json({ trackId: level.trackId, snapshots }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: "Enregistrement impossible",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      },
      { status: 500 }
    );
  }
}
