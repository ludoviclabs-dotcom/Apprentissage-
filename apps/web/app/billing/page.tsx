import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutButton } from "@/components/forms/checkout-button";
import { FeatureNotice } from "@/components/feature-notice";
import {
  entitlementFeatureLabel,
  getBillingStatus,
  subscriptionStatusLabel
} from "@/lib/billing/status";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = {
  title: "Offre — Compte",
  description: "Abonnement, accès aux modules premium et état de la facturation."
};

/**
 * The pricing page, and the current state of the learner's access.
 *
 * It shows both because they answer the same question. Somebody arriving here
 * after paying wants to know whether it worked, and the honest answer is
 * whatever the webhook has written — not what the URL they came back on says.
 */
export default async function BillingPage() {
  const features = getFeatures();
  const status = await getBillingStatus();

  if (!status.billingEnabled) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Offre</span>
            <h1>Paiement désactivé</h1>
            <p>
              Ce déploiement n'a pas de facturation configurée. Tous les modules, y compris le lab
              Excel et les attestations, sont ouverts.
            </p>
          </div>
        </section>
        <section className="panel">
          <FeatureNotice feature={features.billing} tone="info" />
          <p className="muted">
            Pour activer Stripe : <code>FINANCE_HUB_BILLING_ENABLED=true</code>,{" "}
            <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> et au moins un prix.
            Voir <code>docs/local-runbook.md</code>.
          </p>
        </section>
      </div>
    );
  }

  if (!status.signedIn) {
    return (
      <div className="page-stack">
        <section className="page-header">
          <div>
            <span className="section-label">Offre</span>
            <h1>Connecte-toi pour t'abonner</h1>
            <p>Un abonnement est rattaché à un compte : c'est lui qui porte les accès.</p>
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

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Offre</span>
          <h1>Accès premium</h1>
          <p>
            Le socle de comptabilité générale reste gratuit. L'abonnement ouvre le lab Excel et
            l'attestation de complétion.
          </p>
        </div>
        <div className="hero-score">
          <span>Accès actifs</span>
          <strong>{status.activeFeatures.length}</strong>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">Ton accès</span>
        <h2>Ce qui est ouvert aujourd'hui</h2>
        <div className="document-table">
          {status.entitlements.map((entitlement) => (
            <article key={entitlement.feature} className="document-row">
              <span className={entitlement.active ? "state-token ready" : "state-token"}>
                {entitlement.active ? "ouvert" : "fermé"}
              </span>
              <div>
                <strong>{entitlementFeatureLabel(entitlement.feature)}</strong>
                {entitlement.expiresAt ? (
                  <small>
                    Valable jusqu'au{" "}
                    {new Date(entitlement.expiresAt).toLocaleDateString("fr-FR", {
                      dateStyle: "long"
                    })}
                  </small>
                ) : null}
              </div>
              <span />
              <span />
              <span />
            </article>
          ))}
        </div>
        <p className="muted">
          Ces lignes sont écrites uniquement par le webhook Stripe vérifié. Revenir sur la page de
          succès n'ouvre rien : si un paiement vient d'aboutir, l'accès apparaît ici dès que Stripe a
          livré l'évènement.
        </p>
      </section>

      {status.subscriptions.length > 0 ? (
        <section className="panel">
          <span className="section-label">Abonnements</span>
          <h2>État côté Stripe</h2>
          <div className="document-table">
            {status.subscriptions.map((subscription) => (
              <article key={subscription.stripeSubscriptionId} className="document-row">
                <span className="state-token processing">
                  {subscriptionStatusLabel(subscription.status)}
                </span>
                <div>
                  <strong>{subscription.planKey ?? "plan non reconnu"}</strong>
                  {subscription.currentPeriodEnd ? (
                    <small>
                      Période en cours jusqu'au{" "}
                      {new Date(subscription.currentPeriodEnd).toLocaleDateString("fr-FR", {
                        dateStyle: "long"
                      })}
                      {subscription.cancelAtPeriodEnd ? " — résiliation programmée" : ""}
                    </small>
                  ) : null}
                </div>
                <span />
                <span />
                <span />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="course-list">
        {status.plans.map((plan) => (
          <article key={plan.key} className="panel">
            <div className="panel-heading">
              <div>
                <span className="section-label">Abonnement {plan.cadence}</span>
                <h2>{plan.label}</h2>
                <p>{plan.description}</p>
              </div>
              <CheckoutButton plan={plan.key} label="S'abonner" />
            </div>
          </article>
        ))}
      </section>

      {status.plans.length === 0 ? (
        <section className="panel">
          <p className="muted">
            Aucun prix Stripe n'est configuré pour ce déploiement : renseigne{" "}
            <code>STRIPE_PRICE_FOUNDER_ANNUAL</code> ou <code>STRIPE_PRICE_PRO_MONTHLY</code>.
          </p>
        </section>
      ) : null}
    </div>
  );
}
