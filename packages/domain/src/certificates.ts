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
  /** PR-13. Absent on rows issued before public verification existed. */
  verificationId?: string | null;
  status?: CertificateStatus;
  /** The name printed on the document. Empty on pre-PR-13 rows. */
  holderLabel?: string;
}

// --- Public verification (PR-13) --------------------------------------------

/**
 * `superseded` is not a synonym for `revoked`, and the difference is the whole
 * point of re-issuing.
 *
 * A revoked certificate should never have been issued — fraud, or an error at
 * issue time — and says so. A superseded one was earned honestly and still
 * describes something true; it was simply reprinted against a newer curriculum.
 * Telling a holder their attestation is "revoked" because the syllabus was
 * revised would be a false accusation, so the verification page distinguishes
 * them and points at the replacement.
 */
export const CERTIFICATE_STATUSES = ["active", "revoked", "superseded"] as const;

export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/**
 * The opaque identifier behind a verification URL.
 *
 * IT IS A CAPABILITY, NOT A NAME. The serial (`FLH-2026-…`) predates public
 * verification: it carries 40 bits of randomness and its own comment calls it
 * "not a secret", which was true when a certificate was readable by its owner
 * alone. Publishing a page keyed on it would have made a guessable URL disclose
 * a holder's name and track, so verification gets its own identifier — 160 bits
 * from a CSPRNG — and the serial stays what it always was: a human reference
 * printed on the document.
 *
 * Crockford's alphabet: lower case, and without `i`, `l`, `o` or `u`, so a
 * serial read aloud or copied off paper cannot become a different one.
 */
export const VERIFICATION_ID_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export const VERIFICATION_ID_BYTES = 20;
export const VERIFICATION_ID_LENGTH = 32;

const VERIFICATION_ID_PATTERN = /^[0-9abcdefghjkmnpqrstvwxyz]{32}$/;

export function isVerificationId(value: string): boolean {
  return VERIFICATION_ID_PATTERN.test(value);
}

/**
 * Encodes CSPRNG bytes into the alphabet above. Takes the randomness as an
 * argument so the domain stays pure and the test can pin an exact string;
 * callers pass `crypto.getRandomValues`.
 */
export function encodeVerificationId(bytes: Uint8Array): string {
  if (bytes.length < VERIFICATION_ID_BYTES) {
    throw new Error(
      `Un identifiant de vérification exige au moins ${VERIFICATION_ID_BYTES} octets d'aléa.`
    );
  }

  let id = "";

  for (let index = 0; index < VERIFICATION_ID_LENGTH; index += 1) {
    // Five bits per character: 32 characters carry the full 160 bits.
    const bitOffset = index * 5;
    const byte = bitOffset >> 3;
    const shift = bitOffset & 7;
    const pair = (bytes[byte] << 8) | (bytes[byte + 1] ?? 0);

    id += VERIFICATION_ID_ALPHABET[(pair >> (11 - shift)) & 31];
  }

  return id;
}

/**
 * What a certificate asserts, frozen when it is issued.
 *
 * FROZEN, NOT DERIVED. Re-deriving these figures when the PDF is downloaded
 * would let the document change under a holder who has done nothing — a later
 * attempt moves the average, a curriculum revision renames a competency — and
 * the copy already in someone's hands would stop matching the one the server
 * prints. A certificate records a moment; the moment has to be stored.
 */
export interface CertificateContent {
  holderLabel: string;
  trackLabel: string;
  curriculumVersionId: string;
  levelCount: number;
  averageScore: number;
  /** Competency labels the track declares, as worded when it was issued. */
  competencies: string[];
  /** Case studies completed on the track, by title. May be empty. */
  caseStudies: string[];
  /** True when every level was acquired — "réussite" rather than "complétion". */
  allLevelsAcquired: boolean;
}

/**
 * Both titles are honest, and they are not interchangeable.
 *
 * "Réussite" claims the learner cleared every level of the track. "Complétion"
 * claims only that they went through it. Issuance requires the first today, so
 * the second is what an operator-issued or partial attestation would carry —
 * and the wording is decided from the data rather than hard-coded, so a future
 * partial certificate cannot accidentally claim success.
 */
export function certificateTitle(content: CertificateContent): string {
  return content.allLevelsAcquired ? "Attestation de réussite" : "Attestation de complétion";
}

/**
 * The disclaimer, printed on every attestation.
 *
 * The product teaches accounting and finance, fields where a real diploma
 * exists and is regulated. A document that merely *looked* official would be
 * worse than useless to its holder the first time an employer checked, so the
 * PDF says plainly what it is not.
 */
export const CERTIFICATE_DISCLAIMER =
  "Cette attestation est délivrée par une plateforme d'entraînement privée. Elle n'est ni un diplôme, ni un titre, ni une certification professionnelle reconnus par l'État ou par une autorité de certification.";

/** Exactly what `/verify/[id]` may show. Deliberately without e-mail or user id. */
export interface CertificateVerification {
  verificationId: string;
  serial: string;
  /** The holder as printed on the document, never their account address. */
  holderLabel: string;
  trackLabel: string;
  curriculumVersionId: string;
  issuedAt: string;
  status: CertificateStatus;
  revokedAt: string | null;
  /** Serial of the re-issued certificate, when this one was superseded. */
  supersededBySerial: string | null;
}

export function certificateStatusLabel(status: CertificateStatus): string {
  switch (status) {
    case "active":
      return "Attestation valide";
    case "revoked":
      return "Attestation révoquée";
    case "superseded":
      return "Attestation remplacée par une version plus récente";
  }
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
