import type { ModuleLevelDefinition } from "./curriculum";
import type { LevelSnapshot } from "./mastery";

/**
 * The completion certificate: who may have one, and what it says.
 *
 * An attestation is the one artefact a learner takes outside the product, so it
 * has to be worth the paper. Two conditions, both checked server-side against
 * stored state, never against anything a page posted:
 *
 *  - every level of the track is acquired, per the PR-02 mastery snapshots;
 *  - the learner holds the `completion-certificate` entitlement.
 *
 * The second condition is what makes this part of PR-07 rather than PR-02, and
 * it is deliberately checked at *issue* time only. Once issued, a certificate is
 * a record of something that happened; letting a lapsed subscription retract it
 * would make the document worthless to the person who earned it. Revocation
 * exists for fraud, not for churn.
 */

export const CERTIFICATE_BLOCKERS = ["levels-incomplete", "no-entitlement", "track-empty"] as const;

export type CertificateBlocker = (typeof CERTIFICATE_BLOCKERS)[number];

export interface CertificateEligibilityInput {
  /** Every level of the track, in curriculum order. */
  levels: ModuleLevelDefinition[];
  /** The learner's stored snapshots. Missing levels count as not acquired. */
  snapshots: LevelSnapshot[];
  entitled: boolean;
}

export interface CertificateEligibility {
  eligible: boolean;
  blockers: CertificateBlocker[];
  acquiredLevels: number;
  totalLevels: number;
  /** Mean level score across the track, rounded. Printed on the attestation. */
  averageScore: number;
}

export function evaluateCertificateEligibility(
  input: CertificateEligibilityInput
): CertificateEligibility {
  const totalLevels = input.levels.length;
  const byLevel = new Map(input.snapshots.map((snapshot) => [snapshot.levelId, snapshot]));

  const acquired = input.levels.filter((level) => byLevel.get(level.id)?.status === "passed");
  const scores = input.levels.map((level) => byLevel.get(level.id)?.score ?? 0);
  const averageScore =
    totalLevels === 0 ? 0 : Math.round(scores.reduce((sum, score) => sum + score, 0) / totalLevels);

  const blockers: CertificateBlocker[] = [];

  if (totalLevels === 0) {
    // A track with no levels would otherwise be trivially "complete".
    blockers.push("track-empty");
  } else if (acquired.length < totalLevels) {
    blockers.push("levels-incomplete");
  }

  if (!input.entitled) {
    blockers.push("no-entitlement");
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    acquiredLevels: acquired.length,
    totalLevels,
    averageScore
  };
}

/** French, for the eligibility panel. */
export function certificateBlockerLabel(blocker: CertificateBlocker): string {
  switch (blocker) {
    case "levels-incomplete":
      return "Tous les niveaux du parcours ne sont pas encore acquis.";
    case "no-entitlement":
      return "L'attestation fait partie de l'offre premium : un abonnement actif est requis.";
    case "track-empty":
      return "Ce parcours ne déclare aucun niveau.";
  }
}

export interface CertificateRecord {
  serial: string;
  trackId: string;
  trackLabel: string;
  holderEmail: string;
  curriculumVersionId: string;
  levelCount: number;
  averageScore: number;
  issuedAt: string;
  revokedAt: string | null;
}

const SERIAL_PATTERN = /^FLH-\d{4}-[0-9A-F]{10}$/;

/**
 * `FLH-2026-1A2B3C4D5E`. The random half is not a secret — a certificate is
 * readable by its owner only — it exists so two attestations issued the same
 * year cannot collide, and so a serial is quotable without exposing a row id.
 */
export function formatCertificateSerial(year: number, randomHex: string): string {
  const serial = `FLH-${year}-${randomHex.toUpperCase().slice(0, 10).padEnd(10, "0")}`;

  if (!SERIAL_PATTERN.test(serial)) {
    throw new Error(`Numéro d'attestation invalide: ${serial}`);
  }

  return serial;
}

export function isCertificateSerial(value: string): boolean {
  return SERIAL_PATTERN.test(value);
}
