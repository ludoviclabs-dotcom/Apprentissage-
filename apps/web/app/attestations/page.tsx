import Link from "next/link";
import { certificateBlockerLabel } from "@finance/domain";
import { CertificateRequestButton } from "@/components/forms/certificate-request-button";
import { FeatureNotice } from "@/components/feature-notice";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getTrackAttestations } from "@/lib/billing/certificates";
import { getFeatures } from "@/lib/features";

/**
 * What a learner has earned, and what stands between them and the rest.
 *
 * Showing the blockers matters more than showing the button: "tous les niveaux
 * ne sont pas acquis" and "il faut un abonnement" are different problems with
 * different fixes, and a single greyed-out button would say neither.
 */
export const dynamic = "force-dynamic";

export default async function AttestationsPage() {
  const features = getFeatures();
  const user = await getCurrentUser();

  if (!features.persistence.enabled || !user) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Attestations</span>
            <h1>Attestation de complétion</h1>
            <p>
              Une attestation nomme son titulaire et la date d'émission : elle a besoin d'un compte
              et d'une base privée pour exister.
            </p>
          </div>
        </section>
        <section className="panel">
          <FeatureNotice feature={features.persistence} />
          {features.auth.enabled && !user ? (
            <Link href="/login" className="primary-action inline-link">
              Se connecter
            </Link>
          ) : null}
        </section>
      </div>
    );
  }

  const attestations = await getTrackAttestations(user.id);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Attestations</span>
          <h1>Attestation de complétion</h1>
          <p>
            Émise une seule fois par parcours, quand tous les niveaux sont acquis. Une attestation
            déjà émise reste valable même si l'abonnement s'arrête ensuite.
          </p>
        </div>
        <div className="hero-score">
          <span>Émises</span>
          <strong>{attestations.filter((item) => item.certificate).length}</strong>
        </div>
      </section>

      <section className="course-list">
        {attestations.map(({ track, eligibility, certificate }) => (
          <article key={track.trackId} className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Parcours</span>
                <h2>{track.label}</h2>
                <p>
                  {eligibility.acquiredLevels} / {eligibility.totalLevels} niveaux acquis · score
                  moyen {eligibility.averageScore}%
                </p>
              </div>
              {certificate ? (
                <Link className="primary-action" href={`/attestations/${certificate.serial}`}>
                  Voir l'attestation
                </Link>
              ) : eligibility.eligible ? (
                <CertificateRequestButton trackId={track.trackId} />
              ) : null}
            </div>

            {certificate ? (
              <p className="muted">
                Numéro {certificate.serial}, émise le{" "}
                {new Date(certificate.issuedAt).toLocaleDateString("fr-FR", { dateStyle: "long" })}.
              </p>
            ) : (
              <ul className="priority-list">
                {eligibility.blockers.map((blocker) => (
                  <li key={blocker} className="muted">
                    {certificateBlockerLabel(blocker)}
                  </li>
                ))}
              </ul>
            )}

            {!eligibility.eligible && eligibility.blockers.includes("no-entitlement") ? (
              <p className="muted">
                <Link href="/billing" className="inline-link">
                  Voir l'offre premium
                </Link>
              </p>
            ) : null}

            <p className="muted">
              <Link href={track.href} className="inline-link">
                Continuer le parcours
              </Link>
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
