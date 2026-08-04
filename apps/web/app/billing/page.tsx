import type { Metadata } from "next";
import Link from "next/link";
import { FREE_TIER_HIGHLIGHTS, classifySubscriptionStatus } from "@finance/domain";
import { CheckoutButton } from "@/components/forms/checkout-button";
import { PortalButton } from "@/components/forms/portal-button";
import { catalogPlans } from "@/lib/billing/plans";
import {
  entitlementFeatureLabel,
  getBillingStatus,
  subscriptionStatusLabel
} from "@/lib/billing/status";

export const metadata: Metadata = {
  title: "Offre — Compte",
  description: "Le socle gratuit, l'offre fondateur annuelle et l'offre mensuelle."
};

export const dynamic = "force-dynamic";

/**
 * The offer, as a product page.
 *
 * WHAT IT NO LONGER DOES. The previous screen printed `FINANCE_HUB_BILLING_
 * ENABLED`, `STRIPE_SECRET_KEY`, the price variable names and a path to a
 * runbook — configuration instructions addressed to an operator, rendered to
 * every visitor including signed-out ones. That is both a poor shop window and
 * a small disclosure: it told a stranger how this deployment is wired and which
 * half of it was missing. Setup now lives in `docs/local-runbook.md` and behind
 * the role check at `/admin/billing`.
 *
 * One page for four states — signed out or in, billing on or off — because the
 * offer is the same in all of them. Only the call to action changes, and it
 * never claims to sell something that is already open.
 */
export default async function BillingPage() {
  const status = await getBillingStatus();
  const plans = catalogPlans();
  const purchasable = new Set(status.plans.map((plan) => plan.key));
  const subscription = status.subscriptions[0] ?? null;
  const facts = subscription ? classifySubscriptionStatus(subscription.status) : null;

  const FAQ: Array<{ question: string; answer: string }> = [
    {
      question: "Que garde-t-on si l'abonnement s'arrête ?",
      answer:
        "Le socle gratuit reste ouvert, ainsi que votre progression et votre file de révision. Les attestations déjà délivrées restent valides et vérifiables : elles attestent d'un travail accompli, elles ne sont pas une location."
    },
    {
      question: "Comment résilier ?",
      answer:
        "Depuis « Mon compte », le bouton « Gérer mon abonnement » ouvre le portail sécurisé de Stripe : résiliation, changement de carte et factures s'y trouvent. L'accès reste ouvert jusqu'à la fin de la période déjà payée."
    },
    {
      question: "Que se passe-t-il si un paiement échoue ?",
      answer:
        "Stripe represente le paiement pendant quelques jours. L'accès premium est suspendu pendant ce temps, puis rouvert automatiquement dès que le paiement aboutit, sans démarche de votre part."
    },
    {
      question: "L'attestation est-elle un diplôme ?",
      answer:
        "Non. C'est une attestation délivrée par une plateforme d'entraînement privée, vérifiable en ligne par un tiers. Elle n'est ni un diplôme, ni un titre, ni une certification professionnelle reconnus par l'État."
    },
    {
      question: "Les paiements passent-ils par ce site ?",
      answer:
        "Non. Le paiement se déroule entièrement sur les pages hébergées par Stripe ; aucune donnée de carte ne transite par cette application ni n'y est conservée."
    }
  ];

  return (
    <div className="page-stack">
      <section className="page-header page-header--hero">
        <div>
          <span className="section-label">Offre</span>
          <h1>Apprendre la finance d&apos;entreprise, sérieusement</h1>
          <p>
            Le parcours de comptabilité générale est gratuit et complet. L&apos;abonnement ouvre le
            laboratoire Excel et les attestations vérifiables.
          </p>
        </div>
      </section>

      <section className="panel" data-testid="billing-state">
        <span className="section-label">Votre accès aujourd&apos;hui</span>
        {!status.signedIn ? (
          <>
            <h2>Vous n&apos;êtes pas connecté</h2>
            <p className="muted">
              Le socle gratuit s&apos;explore sans compte. Un compte est nécessaire pour conserver
              votre progression et pour souscrire.
            </p>
            <Link className="primary-action inline-link" href="/login">
              Se connecter
            </Link>
          </>
        ) : (
          <>
            <div className="document-table">
              {status.entitlements.map((entitlement) => (
                <article key={entitlement.feature} className="document-row">
                  <span className={entitlement.active ? "state-token ready" : "state-token"}>
                    {entitlement.active ? "Ouvert" : "Fermé"}
                  </span>
                  <div>
                    <strong>{entitlementFeatureLabel(entitlement.feature)}</strong>
                  </div>
                </article>
              ))}
            </div>

            {facts && subscription ? (
              <p className="muted" data-testid="subscription-state">
                {subscriptionStatusLabel(subscription.status)} — {facts.learnerMessage}
              </p>
            ) : null}

            {status.billingEnabled ? (
              <div className="journal-actions">
                <PortalButton />
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="course-list">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Gratuit</span>
              <h2>Socle comptabilité générale</h2>
              <p>0 €</p>
            </div>
          </div>
          <ul className="case-steps">
            {FREE_TIER_HIGHLIGHTS.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
          <Link className="secondary-action inline-link" href="/modules/comptabilite-generale">
            Commencer gratuitement
          </Link>
        </article>

        {plans.map((plan) => (
          <article key={plan.key} className="panel" data-plan={plan.key}>
            <div className="panel-heading">
              <div>
                <span className="section-label">
                  {plan.cadence === "annuel" ? "Offre fondateur" : "Offre mensuelle"}
                </span>
                <h2>{plan.label}</h2>
                <p>{plan.priceLabel}</p>
              </div>
            </div>
            <p className="muted">{plan.description}</p>
            <ul className="case-steps">
              {plan.highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>

            {!status.billingEnabled ? (
              // Billing off means *ungated*, not "gate closed": every premium
              // module is already open, so offering to sell one would be a lie.
              <p className="result-inline muted">
                Le paiement n&apos;est pas activé sur ce déploiement : tous les modules sont
                actuellement ouverts.
              </p>
            ) : !status.signedIn ? (
              <Link className="primary-action inline-link" href="/login">
                Se connecter pour souscrire
              </Link>
            ) : !purchasable.has(plan.key) ? (
              <p className="result-inline muted">Cette formule n&apos;est pas proposée ici.</p>
            ) : (
              <CheckoutButton plan={plan.key} label={`Souscrire — ${plan.priceLabel}`} />
            )}
          </article>
        ))}
      </section>

      <section className="panel">
        <p className="muted">
          Les montants affichés sont indicatifs : le prix exact, la devise et les taxes applicables
          sont présentés par Stripe avant tout paiement.
        </p>
      </section>

      <section className="panel" data-testid="billing-faq">
        <span className="section-label">Questions fréquentes</span>
        <h2>Ce qu&apos;il faut savoir avant de souscrire</h2>
        <div className="document-table">
          {FAQ.map((entry) => (
            <article key={entry.question} className="document-row">
              <span className="state-token">?</span>
              <div>
                <strong>{entry.question}</strong>
                <small>{entry.answer}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
