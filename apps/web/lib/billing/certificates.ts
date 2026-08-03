import "server-only";
import { getCertificateForTrack, refreshTrackProgress } from "@finance/db";
import {
  COMPTA_GENERALE_V1_TRACK,
  EXCEL_LAB_TRACK,
  activeCurriculum,
  evaluateCertificateEligibility,
  getTrackLevels,
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

export function getTrackLevelDefinitions(trackId: string): ModuleLevelDefinition[] {
  return getTrackLevels(activeCurriculum, trackId);
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
  const levels = getTrackLevelDefinitions(track.trackId);
  const [snapshots, certificate, entitlement] = await Promise.all([
    refreshTrackProgress(userId, track.trackId),
    getCertificateForTrack(userId, track.trackId),
    resolveEntitlement("completion-certificate")
  ]);

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
