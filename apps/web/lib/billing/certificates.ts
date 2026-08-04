import "server-only";
import { getCertificateForTrack, getTrackCurriculum, refreshTrackProgress } from "@finance/db";
import {
  COMPTA_GENERALE_V1_TRACK,
  EXCEL_LAB_TRACK,
  activeCurriculum,
  evaluateCertificateEligibility,
  getCurriculumVersion,
  getPublishedTrackLevels,
  type CertificateEligibility,
  type CertificateRecord,
  type ModuleLevelDefinition
} from "@finance/domain";
import { resolveEntitlement } from "@/lib/billing/entitlements";

/**
 * Which tracks can be attested, and whether this learner has finished one.
 *
 * The list is data rather than a lookup per page, for the same reason
 * `packages/domain/src/modules.ts` is: adding a track that can be attested
 * should be an entry here, not a new branch in the issuing route.
 */

export interface AttestableTrack {
  trackId: string;
  label: string;
  /** Where the learner goes to finish it. */
  href: string;
}

export const ATTESTABLE_TRACKS: AttestableTrack[] = [
  {
    trackId: COMPTA_GENERALE_V1_TRACK,
    label: "Comptabilité générale v1",
    href: "/modules/comptabilite-generale"
  },
  {
    trackId: EXCEL_LAB_TRACK,
    label: "Excel Finance Lab",
    href: "/modules/excel-finance-lab"
  }
];

export function findAttestableTrack(trackId: string): AttestableTrack | null {
  return ATTESTABLE_TRACKS.find((track) => track.trackId === trackId) ?? null;
}

/**
 * The levels an attestation is judged against, for one curriculum version.
 *
 * TWO THINGS HAVE TO AGREE and used not to. Completion is graded by
 * `refreshTrackProgress`, which evaluates the learner's *pinned* curriculum and
 * only its **published** levels. Eligibility used to compare those snapshots
 * against every level of the *active* curriculum. Publishing N3 and N4 therefore
 * made an attestation unobtainable for anybody who had finished the two-level
 * version: their two snapshots were measured against four levels, two of which
 * they were never asked to take. A `planned` level would do the same, because a
 * level with no snapshot counts as not acquired.
 *
 * Passing the version explicitly, and filtering to published, is what keeps the
 * three readings — levels, snapshots and the printed document — describing the
 * same syllabus.
 */
export function getTrackLevelDefinitions(
  trackId: string,
  curriculumVersionId?: string
): ModuleLevelDefinition[] {
  const version =
    (curriculumVersionId ? getCurriculumVersion(curriculumVersionId) : null) ?? activeCurriculum;

  return getPublishedTrackLevels(version, trackId);
}

/**
 * The curriculum version an attestation must be judged against: the one the
 * learner is enrolled on, falling back to the active one when there is no
 * enrolment (or no database) to read.
 */
export async function resolveLearnerCurriculumId(
  userId: string,
  trackId: string
): Promise<string> {
  const pinned = await getTrackCurriculum(userId, trackId).catch(() => null);

  return pinned?.id ?? activeCurriculum.id;
}

export interface TrackAttestation {
  track: AttestableTrack;
  levels: ModuleLevelDefinition[];
  eligibility: CertificateEligibility;
  certificate: CertificateRecord | null;
}

/**
 * The state of one track for one learner: how far they got, whether they may
 * have the attestation, and whether they already do.
 *
 * `refreshTrackProgress` is the same call the module pages make, so the
 * completion this reports and the completion the level track displays cannot
 * disagree — the certificate is not scored on a second, parallel notion of
 * "finished".
 */
export async function getTrackAttestation(
  userId: string,
  track: AttestableTrack
): Promise<TrackAttestation> {
  const [pinned, snapshots, certificate, entitlement] = await Promise.all([
    // The version that graded this learner. Reading the levels from whichever
    // curriculum is active today would measure old snapshots against a newer
    // syllabus, and the page would report a finished track as unfinished.
    resolveLearnerCurriculumId(userId, track.trackId),
    refreshTrackProgress(userId, track.trackId),
    getCertificateForTrack(userId, track.trackId),
    resolveEntitlement("completion-certificate")
  ]);
  const levels = getTrackLevelDefinitions(track.trackId, pinned);

  return {
    track,
    levels,
    eligibility: evaluateCertificateEligibility({
      levels,
      snapshots,
      entitled: entitlement.allowed
    }),
    certificate
  };
}

export async function getTrackAttestations(userId: string): Promise<TrackAttestation[]> {
  return Promise.all(ATTESTABLE_TRACKS.map((track) => getTrackAttestation(userId, track)));
}
