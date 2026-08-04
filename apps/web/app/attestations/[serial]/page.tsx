import Link from "next/link";
import { notFound } from "next/navigation";
import { getCertificateBySerial } from "@finance/db";
import { activeCurriculum, isCertificateSerial } from "@finance/domain";
import { getCurrentUser } from "@/lib/auth/current-user";
import { findAttestableTrack } from "@/lib/billing/certificates";
import { getFeatures } from "@/lib/features";

/**
 * The attestation itself: a printable page, not a PDF.
 *
 * No PDF library, on purpose. `AGENTS.md` and the architecture note both commit
 * this app to running without internet and without heavyweight rendering
 * dependencies, and a browser's own "print to PDF" produces a better-typeset
 * document than a first-pass HTML-to-PDF pipeline would. What the attestation
 * has to guarantee is that its *contents* are true, and those come from a row
 * only the server can write.
 *
 * OWNER-ONLY. The serial is looked up scoped to the signed-in user, so it names
 * a document rather than granting access to one — which is why it can stay short
 * enough to quote out loud.
 */
export const dynamic = "force-dynamic";

export default async function AttestationPage({
  params
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial } = await params;

  // Reject a malformed serial before touching the database: this segment is
  // free text from the URL.
  if (!isCertificateSerial(serial)) {
    notFound();
  }

  const features = getFeatures();
  const user = await getCurrentUser();

  if (!features.persistence.enabled || !user) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Attestation</span>
            <h1>Accès restreint</h1>
            <p>Une attestation n'est consultable que par le compte qui la détient.</p>
          </div>
        </section>
        <section className="panel">
          <Link href="/login" className="primary-action inline-link">
            Se connecter
          </Link>
        </section>
      </div>
    );
  }

  const certificate = await getCertificateBySerial(user.id, serial);

  if (!certificate) {
    notFound();
  }

  const track = findAttestableTrack(certificate.trackId);
  const issuedAt = new Date(certificate.issuedAt).toLocaleDateString("fr-FR", {
    dateStyle: "long"
  });

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Attestation de complétion</span>
          <h1>{certificate.trackLabel}</h1>
          <p>Numéro {certificate.serial}</p>
        </div>
        <div className="hero-score">
          <span>Score moyen</span>
          <strong>{certificate.averageScore}%</strong>
        </div>
      </section>

      {certificate.revokedAt ? (
        <section className="panel">
          <p className="feature-notice" role="note">
            Cette attestation a été annulée le{" "}
            {new Date(certificate.revokedAt).toLocaleDateString("fr-FR", { dateStyle: "long" })}.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <span className="section-label">Attestation</span>
        <h2>Finance Learning Hub certifie que</h2>
        <p>
          {/* The printed name, not the account address: an attestation is shown
              to third parties. Pre-PR-13 rows have no label and fall back. */}
          <strong>{certificate.holderLabel || certificate.holderEmail}</strong> a suivi et validé
          l'intégralité du parcours{" "}
          <strong>{certificate.trackLabel}</strong>, soit {certificate.levelCount} niveau
          {certificate.levelCount > 1 ? "x" : ""} acquis selon les règles du référentiel{" "}
          <strong>{certificate.curriculumVersionId}</strong>
          {certificate.curriculumVersionId === activeCurriculum.id
            ? ""
            : " (version en vigueur au moment de l'émission)"}
          , avec un score moyen de {certificate.averageScore}%.
        </p>
        <p className="muted">Émise le {issuedAt}.</p>
        <p className="muted">
          Chaque niveau est acquis en atteignant le seuil du référentiel sur des exercices corrigés
          de façon déterministe, pas par simple consultation du cours. Cette attestation constate un
          parcours interne : elle ne constitue ni un diplôme, ni une certification professionnelle
          reconnue par l'État.
        </p>
      </section>

      <section className="panel">
        <span className="section-label">Document</span>
        <h2>Télécharger l&apos;attestation</h2>
        {certificate.verificationId ? (
          <>
            <p className="muted">
              Le PDF porte un QR code et une adresse de vérification : un tiers peut confirmer sa
              validité sans avoir accès à votre compte.
            </p>
            <div className="journal-actions">
              <a
                className="primary-action"
                href={`/api/certificates/${certificate.serial}/pdf`}
                download
              >
                Télécharger le PDF
              </a>
              <a
                className="secondary-action"
                href={`/verify/${certificate.verificationId}`}
                target="_blank"
                rel="noreferrer"
              >
                Voir la page de vérification
              </a>
            </div>
          </>
        ) : (
          <p className="muted">
            Cette attestation a été délivrée avant la mise en place de la vérification publique :
            elle reste consultable ici, mais sans PDF ni QR code.
          </p>
        )}
      </section>

      <section className="panel">
        <span className="section-label">Vérification</span>
        <h2>Ce que ce document engage</h2>
        <p className="muted">
          L'attestation est émise depuis les évaluations enregistrées sur ce compte et n'est
          consultable que par lui. Une fois émise, elle reste valable indépendamment de l'abonnement
          : elle constate un travail accompli, elle n'est pas un droit d'accès.
        </p>
        <p className="muted">
          <Link href="/attestations" className="inline-link">
            Toutes mes attestations
          </Link>
          {track ? (
            <>
              {" · "}
              <Link href={track.href} className="inline-link">
                Revoir le parcours
              </Link>
            </>
          ) : null}
        </p>
      </section>
    </div>
  );
}
