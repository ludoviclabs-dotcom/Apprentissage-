import { getUserProfile, issueCertificate, refreshTrackProgress } from "@finance/db";
import {
  activeCurriculum,
  certificateBlockerLabel,
  evaluateCertificateEligibility
} from "@finance/domain";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { findAttestableTrack, getTrackLevelDefinitions } from "@/lib/billing/certificates";
import { buildCertificateContent, resolveHolderLabel } from "@/lib/certificates/content";
import { getFeatures } from "@/lib/features";
import { getCanonicalTrackState } from "@/lib/learning-progression";

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

  // The name goes on the document and cannot be invented. Refusing here is
  // kinder than printing an attestation addressed to an inbox.
  const profile = await getUserProfile(caller.user.id).catch(() => null);
  const holderLabel = resolveHolderLabel(profile?.displayName);

  if (!holderLabel) {
    return Response.json(
      {
        error: "Nom manquant",
        details:
          "Renseigne ton nom dans « Mon compte » avant de demander une attestation : c'est le nom qui sera imprimé dessus.",
        blockers: ["holder-name-missing"]
      },
      { status: 409 }
    );
  }

  try {
    const levels = getTrackLevelDefinitions(track.trackId);
    const snapshots = await refreshTrackProgress(caller.user.id, track.trackId);
    // The curriculum that graded this learner, not whichever one is active
    // today. An enrolment is pinned to a version, and an attestation citing a
    // version that never scored them would be false — durably so, once it is a
    // PDF in somebody's files.
    const progression = await getCanonicalTrackState(caller.user.id, track.trackId);
    const curriculumVersionId = progression.curriculumId || activeCurriculum.id;

    const result = await issueCertificate({
      userId: caller.user.id,
      holderEmail: caller.user.email,
      holderLabel,
      trackId: track.trackId,
      trackLabel: track.label,
      curriculumVersionId,
      levels,
      snapshots,
      content: buildCertificateContent({
        holderLabel,
        trackLabel: track.label,
        curriculumVersionId,
        trackId: track.trackId,
        levels,
        snapshots,
        averageScore: evaluateCertificateEligibility({
          levels,
          snapshots,
          entitled: true
        }).averageScore
      })
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
