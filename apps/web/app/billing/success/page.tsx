import Link from "next/link";
import { entitlementFeatureLabel, getBillingStatus } from "@/lib/billing/status";

/**
 * The return from Stripe. It grants nothing.
 *
 * This is the single most important rule of the integration, so it is worth
 * stating where the temptation lives. A learner lands here with
 * `?session_id=cs_…` in the URL, and it would be one line to look that session
 * up and open the module. It would also be wrong twice over: the parameter is
 * attacker-controlled — anyone can visit this URL with any string — and even a
 * genuine session id proves only that a checkout was *started*.
 *
 * So the page reads the entitlements the verified webhook wrote, and reports one
 * of two states: access is open, or Stripe has not delivered the event yet.
 * `session_id` is not read at all; it exists in the URL because Stripe puts it
 * there, and it stays unused.
 *
 * `dynamic = "force-dynamic"` because the answer changes the moment a webhook
 * lands, and a cached "not yet" would be indistinguishable from a broken one.
 */

export const dynamic = "force-dynamic";

export default async function BillingSuccessPage() {
  const status = await getBillingStatus();
  const opened = status.entitlements.filter((entitlement) => entitlement.active);

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Paiement</span>
          <h1>{opened.length > 0 ? "Paiement confirmé" : "Paiement reçu par Stripe"}</h1>
          <p>
            {opened.length > 0
              ? "Ton abonnement est actif et les modules premium sont ouverts."
              : "Stripe a accepté le paiement. L'accès s'ouvre dès que l'évènement signé est arrivé — quelques secondes en général."}
          </p>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">Accès</span>
        <h2>Ce qui est ouvert</h2>
        {opened.length > 0 ? (
          <div className="document-table">
            {opened.map((entitlement) => (
              <article key={entitlement.feature} className="document-row">
                <span className="state-token ready">ouvert</span>
                <div>
                  <strong>{entitlementFeatureLabel(entitlement.feature)}</strong>
                </div>
                <span />
                <span />
                <span />
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">
            Rien n'est encore ouvert sur ce compte. Cette page ne débloque volontairement aucun
            accès : seul le webhook Stripe vérifié écrit les droits. Recharge dans quelques secondes,
            ou consulte l'état complet sur la page offre.
          </p>
        )}
        <p className="muted">
          <Link href="/billing" className="inline-link">
            Voir l'état de l'abonnement
          </Link>
        </p>
      </section>

      <section className="panel">
        <span className="section-label">Et ensuite</span>
        <h2>Reprendre le parcours</h2>
        <p>
          Le lab Excel corrige le résultat et la formule séparément, et l'attestation devient
          disponible une fois tous les niveaux d'un parcours acquis.
        </p>
        <p className="muted">
          <Link href="/modules/excel-finance-lab" className="inline-link">
            Ouvrir l'Excel Finance Lab
          </Link>
          {" · "}
          <Link href="/attestations" className="inline-link">
            Mes attestations
          </Link>
        </p>
      </section>
    </div>
  );
}
