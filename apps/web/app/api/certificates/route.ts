import { issueCertificate, refreshTrackProgress } from "@finance/db";
import { activeCurriculum, certificateBlockerLabel } from "@finance/domain";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { findAttestableTrack, getTrackLevelDefinitions } from "@/lib/billing/certificates";
import { getFeatures } from "@/lib/features";

/**
 * Issues the completion attestation for a finished track.
 *
 * NOTHING IN THE REQUEST IS TRUSTED BEYOND THE TRACK ID. Completion is read from
 * the learner's stored mastery snapshots and the entitlement from
 * `entitlements`; the body cannot carry a score, a level list or a claim of
 * having paid. `issueCertificate` re-checks both server-side, so this route is
 * the place that says *which* track, never *whether*.
 *
 * Issuing is idempotent: asking twice returns the certificate already issued
 * rather than minting a second serial for the same work.
 */

export const runtime = "nodejs";

const certificateSchema = z.object({
  trackId: z.string().min(1).max(120)
});

export async function POST(request: Request) {
  const features = getFeatures();

  if (!features.persistence.enabled) {
    // An attestation that vanishes on restart is worse than none: it is a
    // document the learner would go on to quote.
    return Response.json(
      { error: "Attestation indisponible", details: features.persistence.reason },
      { status: 501 }
    );
  }

  const caller = await requireCurrentUser();

  if (caller.response) {
    return caller.response;
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête illisible" }, { status: 400 });
  }

  const body = certificateSchema.safeParse(payload);

  if (!body.success) {
    return Response.json(
      { error: "Parcours invalide", details: body.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const track = findAttestableTrack(body.data.trackId);

  if (!track) {
    return Response.json({ error: "Parcours sans attestation" }, { status: 404 });
  }

  try {
    const result = await issueCertificate({
      userId: caller.user.id,
      holderEmail: caller.user.email,
      trackId: track.trackId,
      trackLabel: track.label,
      curriculumVersionId: activeCurriculum.id,
      levels: getTrackLevelDefinitions(track.trackId),
      snapshots: await refreshTrackProgress(caller.user.id, track.trackId)
    });

    if (result.status === "refused") {
      // 409 rather than 402 even when the blocker is the entitlement: more than
      // one condition can fail at once, and the response lists all of them
      // instead of picking one to name in a status code.
      return Response.json(
        {
          error: "Attestation refusée",
          blockers: result.eligibility.blockers,
          details: result.eligibility.blockers.map(certificateBlockerLabel),
          progress: {
            acquiredLevels: result.eligibility.acquiredLevels,
            totalLevels: result.eligibility.totalLevels
          }
        },
        { status: 409 }
      );
    }

    return Response.json(
      { certificate: result.certificate, issued: result.status === "issued" },
      { status: result.status === "issued" ? 201 : 200 }
    );
  } catch (error) {
    return Response.json(
      {
        error: "Émission impossible",
        details: error instanceof Error ? error.message : "Erreur inconnue"
      },
      { status: 500 }
    );
  }
}
