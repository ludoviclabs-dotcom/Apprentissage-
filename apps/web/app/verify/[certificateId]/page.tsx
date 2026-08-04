import type { Metadata } from "next";
import { getCertificateVerification } from "@finance/db";
import {
  CERTIFICATE_DISCLAIMER,
  certificateStatusLabel,
  isVerificationId,
  type CertificateVerification
} from "@finance/domain";
import { getFeatures } from "@/lib/features";

/**
 * Public verification. The one page in this product a stranger is meant to open.
 *
 * WHAT IT MAY SHOW is fixed by the brief and by the table it reads: validity,
 * the holder as printed on the document, the track, the date, the curriculum
 * version and the status. Nothing else exists to leak — `certificate_
 * verifications` has no `user_id`, no e-mail, no score and no revocation
 * reason, so the guarantee is structural rather than a habit of writing
 * careful `SELECT`s (see migration 0012).
 *
 * The score is deliberately absent even though the PDF prints it: the holder
 * chose to hand over that document, they did not choose to publish their marks
 * at a URL. Verification answers "is this genuine", not "how did they do".
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérification d'attestation",
  description: "Vérifier la validité d'une attestation Finance Learning Hub.",
  // A verification URL is a capability. Keeping it out of search indexes stops
  // an attestation from turning up in a query for its holder's name.
  robots: { index: false, follow: false }
};

function frenchDate(iso: string): string {
  const parsed = Date.parse(iso);

  return Number.isNaN(parsed)
    ? iso
    : new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(parsed);
}

function statusTone(status: CertificateVerification["status"]): string {
  return status === "active" ? "state-token ready" : "state-token error";
}

/** Every refusal renders the same panel: an unknown id and a withdrawn one must
 * be indistinguishable, or the page becomes an oracle for guessing ids. */
function NotVerifiable({ note }: { note: string }) {
  return (
    <div className="page-stack">
      <section className="page-header page-header--hero">
        <div>
          <span className="section-label">Vérification</span>
          <h1>Attestation introuvable</h1>
          <p>{note}</p>
        </div>
      </section>
      <section className="panel">
        <p className="muted">
          Vérifiez l&apos;adresse ou scannez de nouveau le code figurant sur le document. Une
          attestation retirée par son émetteur n&apos;apparaît plus ici.
        </p>
      </section>
    </div>
  );
}

export default async function VerifyCertificatePage({
  params
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;
  const features = getFeatures();

  // Shape-checked before any query: a malformed id is never a lookup, which
  // keeps this route from being a cheap way to probe the database.
  if (!isVerificationId(certificateId)) {
    return <NotVerifiable note="Cet identifiant de vérification n'est pas valide." />;
  }

  if (!features.persistence.enabled) {
    return (
      <div className="page-stack">
        <section className="page-header page-header--hero">
          <div>
            <span className="section-label">Vérification</span>
            <h1>Vérification indisponible</h1>
            {/* Deliberately not `features.persistence.reason`: that string names
                the environment variables this deployment is missing, and this
                page is the one surface built for strangers. An operator reads
                the reason in the server logs and in the administration area. */}
            <p>
              Le service de vérification n&apos;est pas disponible sur ce déploiement. Réessayez plus
              tard ou contactez l&apos;émetteur de l&apos;attestation.
            </p>
          </div>
        </section>
      </div>
    );
  }

  const verification = await getCertificateVerification(certificateId);

  if (!verification) {
    return <NotVerifiable note="Aucune attestation ne correspond à cet identifiant." />;
  }

  const valid = verification.status === "active";

  return (
    <div className="page-stack">
      <section className="page-header page-header--hero">
        <div>
          <span className="section-label">Vérification</span>
          <h1>{certificateStatusLabel(verification.status)}</h1>
          <p>
            {valid
              ? "Cette attestation a bien été délivrée par Finance Learning Hub et est toujours valide."
              : "Cette attestation a bien été délivrée, mais elle n'est plus valide en l'état."}
          </p>
        </div>
        <div className="hero-score">
          <span>Statut</span>
          <strong data-testid="verification-status">{valid ? "Valide" : "Non valide"}</strong>
        </div>
      </section>

      <section className="panel" data-testid="verification-details">
        <div className="document-table">
          <article className="document-row">
            <span className={statusTone(verification.status)}>Titulaire</span>
            <div>
              <strong>{verification.holderLabel}</strong>
              <small>Nom tel qu&apos;il figure sur le document.</small>
            </div>
          </article>
          <article className="document-row">
            <span className="state-token">Parcours</span>
            <div>
              <strong>{verification.trackLabel}</strong>
            </div>
          </article>
          <article className="document-row">
            <span className="state-token">Délivrée le</span>
            <div>
              <strong>{frenchDate(verification.issuedAt)}</strong>
            </div>
          </article>
          <article className="document-row">
            <span className="state-token">Version du curriculum</span>
            <div>
              <strong>{verification.curriculumVersionId}</strong>
            </div>
          </article>
          <article className="document-row">
            <span className="state-token">Numéro</span>
            <div>
              <strong>{verification.serial}</strong>
            </div>
          </article>
        </div>
      </section>

      {verification.status === "revoked" ? (
        <section className="panel">
          <span className="section-label">Révocation</span>
          <p>
            Cette attestation a été révoquée par son émetteur
            {verification.revokedAt ? ` le ${frenchDate(verification.revokedAt)}` : ""}. Elle ne
            peut plus être présentée comme valide.
          </p>
          {/* The reason is not published. It is a matter between the emitter and
              the holder, and this URL is open to anyone holding the QR code. */}
          <p className="muted">
            Le motif n&apos;est pas rendu public. Le titulaire peut contacter l&apos;émetteur pour en
            connaître les détails.
          </p>
        </section>
      ) : null}

      {verification.status === "superseded" ? (
        <section className="panel">
          <span className="section-label">Remplacement</span>
          <p>
            Une version plus récente de cette attestation a été délivrée
            {verification.supersededBySerial
              ? ` sous le numéro ${verification.supersededBySerial}`
              : ""}
            . Le présent document reste authentique mais n&apos;est plus la version en vigueur.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <span className="section-label">Portée de cette attestation</span>
        <p className="muted">{CERTIFICATE_DISCLAIMER}</p>
      </section>
    </div>
  );
}
