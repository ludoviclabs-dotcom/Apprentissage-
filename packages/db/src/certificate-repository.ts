import { and, desc, eq } from "drizzle-orm";
// `certificatesTable` is written here only through the owner's own context.
import type { CertificateContent, CertificateStatus, CertificateVerification } from "@finance/domain";
import { canUseDatabase, createDb } from "./client";
import { certificateRevocationsTable, certificateVerificationsTable, certificatesTable } from "./drizzle-schema";
import { assertUserId, withUserContext } from "./user-context";

/**
 * Verification and revocation (PR-13).
 *
 * TWO TABLES, TWO AUDIENCES. `certificates` holds the frozen content and the
 * owner link, under row level security, and is written by nobody but its owner.
 * `certificate_verifications` holds the projection a stranger may read and is
 * the single authority on whether an attestation still stands — which is why
 * revocation writes there rather than fighting the policy on the private row.
 * See migration 0012 for the full reasoning.
 */

export class CertificateStoreUnavailableError extends Error {
  constructor(operation: string) {
    super(`La base est requise pour ${operation}.`);
    this.name = "CertificateStoreUnavailableError";
  }
}

function assertDatabase(operation: string): void {
  if (!canUseDatabase()) {
    throw new CertificateStoreUnavailableError(operation);
  }
}

function toIso(value: string | null): string | null {
  if (!value) {
    return null;
  }

  // postgres-js hands back `2027-07-28 00:00:00+00`; every timestamp that
  // leaves this package is ISO.
  const parsed = Date.parse(value.includes("T") ? value : value.replace(" ", "T"));

  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function toStatus(value: string): CertificateStatus {
  return value === "revoked" || value === "superseded" ? value : "active";
}

/**
 * The public lookup: no session, no user context, no personal data beyond the
 * name printed on the document.
 *
 * It runs on a plain connection because the projection carries no row level
 * security — there is no `user_id` on it to police, and the 160-bit identifier
 * is the access control. Returns null for an unknown id, which is also what a
 * revoked-and-deleted document would return: the page cannot distinguish
 * "never existed" from "gone", and should not.
 */
export async function getCertificateVerification(
  verificationId: string
): Promise<CertificateVerification | null> {
  assertDatabase("vérifier une attestation");

  const rows = await createDb()
    .select({
      verificationId: certificateVerificationsTable.verificationId,
      serial: certificateVerificationsTable.serial,
      holderLabel: certificateVerificationsTable.holderLabel,
      trackLabel: certificateVerificationsTable.trackLabel,
      curriculumVersionId: certificateVerificationsTable.curriculumVersionId,
      issuedAt: certificateVerificationsTable.issuedAt,
      status: certificateVerificationsTable.status,
      revokedAt: certificateVerificationsTable.revokedAt,
      supersededBySerial: certificateVerificationsTable.supersededBySerial
    })
    .from(certificateVerificationsTable)
    .where(eq(certificateVerificationsTable.verificationId, verificationId))
    .limit(1);

  const row = rows[0];

  if (!row) {
    return null;
  }

  return {
    ...row,
    issuedAt: toIso(row.issuedAt) as string,
    revokedAt: toIso(row.revokedAt),
    status: toStatus(row.status)
  };
}

/** The verification row behind a serial, for the owner's own attestation page. */
export async function getVerificationBySerial(
  serial: string
): Promise<CertificateVerification | null> {
  assertDatabase("lire le statut d'une attestation");

  const rows = await createDb()
    .select({ verificationId: certificateVerificationsTable.verificationId })
    .from(certificateVerificationsTable)
    .where(eq(certificateVerificationsTable.serial, serial))
    .limit(1);

  return rows[0] ? getCertificateVerification(rows[0].verificationId) : null;
}

export interface CertificateForDocument {
  serial: string;
  verificationId: string;
  content: CertificateContent;
  issuedAt: string;
  status: CertificateStatus;
}

/**
 * Everything the PDF needs, read by its owner.
 *
 * The content comes back as stored: this function deliberately does not
 * recompute a score or re-read a curriculum, because the document must keep
 * saying what it said the day it was issued.
 */
export async function getCertificateForDocument(
  userId: string,
  serial: string
): Promise<CertificateForDocument | null> {
  assertDatabase("générer une attestation");
  assertUserId(userId, "getCertificateForDocument");

  const rows = await withUserContext(userId, (db) =>
    db
      .select({
        serial: certificatesTable.serial,
        verificationId: certificatesTable.verificationId,
        contentJson: certificatesTable.contentJson,
        issuedAt: certificatesTable.issuedAt
      })
      .from(certificatesTable)
      .where(and(eq(certificatesTable.userId, userId), eq(certificatesTable.serial, serial)))
      .limit(1)
  );

  const row = rows[0];

  if (!row || !row.verificationId) {
    // A certificate issued before PR-13 has no verification id and therefore no
    // QR target. It stays readable as HTML; it cannot be printed as a PDF that
    // promises a verification URL it does not have.
    return null;
  }

  // The status a document reports is the public one, so a revoked attestation
  // cannot be re-downloaded as though it still stood.
  const verification = await getCertificateVerification(row.verificationId);

  return {
    serial: row.serial,
    verificationId: row.verificationId,
    content: row.contentJson as CertificateContent,
    issuedAt: toIso(row.issuedAt) as string,
    status: verification?.status ?? "active"
  };
}

export interface RevokeCertificateInput {
  serial: string;
  reason: string;
  /** The administrator's e-mail. An audit trail with no actor is not one. */
  revokedBy: string;
}

export type RevokeCertificateResult =
  | { status: "revoked"; verification: CertificateVerification }
  | { status: "not-found" }
  | { status: "already-revoked"; verification: CertificateVerification };

/**
 * Withdraws an attestation.
 *
 * Runs outside any user context on purpose: the operator is not the holder, and
 * the projection carries no policy to satisfy. The private `certificates` row
 * is left untouched — see migration 0012 — so the holder keeps their copy and
 * the document simply stops verifying. Its own `status` column converges the
 * next time its owner touches it, in {@link syncCertificateStatusFromPublic}.
 */
export async function revokeCertificate(
  input: RevokeCertificateInput
): Promise<RevokeCertificateResult> {
  assertDatabase("révoquer une attestation");

  const reason = input.reason.trim();

  if (reason === "") {
    throw new Error("Une révocation exige un motif interne.");
  }

  const db = createDb();
  const revokedAt = new Date().toISOString();

  // THE STATE CHANGE IS THE CLAIM, not a check followed by a write.
  //
  // Reading the row, deciding it was still active and then updating it let two
  // simultaneous revocations both pass the check and both write an audit entry
  // — one withdrawal, two records of who withdrew it, which is precisely what
  // an audit trail must not do. `WHERE status = 'active' … RETURNING` makes
  // exactly one caller the winner, and the loser learns it from an empty
  // result rather than from a second read.
  const claimed = await db
    .update(certificateVerificationsTable)
    .set({ status: "revoked", revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(certificateVerificationsTable.serial, input.serial),
        eq(certificateVerificationsTable.status, "active")
      )
    )
    .returning({ verificationId: certificateVerificationsTable.verificationId });

  if (claimed.length === 0) {
    // Either the serial is unknown, or somebody else got there first.
    const existing = await getVerificationBySerial(input.serial);

    if (!existing) {
      return { status: "not-found" };
    }

    return { status: "already-revoked", verification: existing };
  }

  await db.insert(certificateRevocationsTable).values({
    serial: input.serial,
    reason,
    revokedBy: input.revokedBy,
    revokedAt
  });

  const verification = await getCertificateVerification(claimed[0]!.verificationId);

  return verification ? { status: "revoked", verification } : { status: "not-found" };
}

/**
 * Marks the previous attestation of a track as replaced.
 *
 * `superseded` is not `revoked`: the older document was earned and still
 * describes something true, it has simply been reprinted against a newer
 * curriculum. Saying "revoked" instead would accuse a holder of nothing they
 * did.
 */
export async function supersedeCertificate(
  previousSerial: string,
  replacementSerial: string
): Promise<void> {
  assertDatabase("remplacer une attestation");

  const now = new Date().toISOString();

  await createDb()
    .update(certificateVerificationsTable)
    .set({ status: "superseded", supersededBySerial: replacementSerial, updatedAt: now })
    .where(eq(certificateVerificationsTable.serial, previousSerial));
}

/**
 * Brings a learner's private certificate row in line with the public status.
 *
 * WHY THIS EXISTS. Revocation and supersession are written by an operator, or
 * by a re-issue, and neither can touch `certificates`: it is FORCE row level
 * security keyed on its owner. Left alone, the private row stayed `active`
 * forever — and since the partial unique index counts *active* rows, a revoked
 * attestation permanently blocked its own replacement. The learner was told
 * "you already have one" about a document that no longer verified.
 *
 * So the owner reconciles it themselves, in their own context, the next time
 * they ask for an attestation. The public projection stays the single authority
 * on validity; this only lets the private row stop contradicting it.
 *
 * Returns the status now recorded, so the caller can decide whether an active
 * certificate really exists.
 */
export async function syncCertificateStatusFromPublic(
  userId: string,
  serial: string
): Promise<CertificateStatus> {
  assertDatabase("synchroniser le statut d'une attestation");
  assertUserId(userId, "syncCertificateStatusFromPublic");

  const verification = await getVerificationBySerial(serial);

  // No projection row at all means the certificate predates PR-13; it has no
  // public status to converge on and is left exactly as it is.
  if (!verification || verification.status === "active") {
    return verification?.status ?? "active";
  }

  await withUserContext(userId, (db) =>
    db
      .update(certificatesTable)
      .set({
        status: verification.status,
        supersededBySerial: verification.supersededBySerial,
        revokedAt: verification.revokedAt,
        // The paired CHECK from migration 0009 refuses a revocation date with
        // no reason. The real reason lives in `certificate_revocations` and is
        // internal to the operator, so the owner's copy records only that it
        // was withdrawn.
        revokedReason: verification.status === "revoked" ? "révoquée par l'émetteur" : null
      })
      .where(and(eq(certificatesTable.userId, userId), eq(certificatesTable.serial, serial)))
  );

  return verification.status;
}

export interface CertificateRevocationEntry {
  serial: string;
  reason: string;
  revokedBy: string;
  revokedAt: string;
}

/** The internal trail, for the administration screen only. */
export async function listCertificateRevocations(
  limit = 50
): Promise<CertificateRevocationEntry[]> {
  assertDatabase("lister les révocations");

  const rows = await createDb()
    .select({
      serial: certificateRevocationsTable.serial,
      reason: certificateRevocationsTable.reason,
      revokedBy: certificateRevocationsTable.revokedBy,
      revokedAt: certificateRevocationsTable.revokedAt
    })
    .from(certificateRevocationsTable)
    .orderBy(desc(certificateRevocationsTable.revokedAt))
    .limit(limit);

  return rows.map((row) => ({ ...row, revokedAt: toIso(row.revokedAt) as string }));
}
