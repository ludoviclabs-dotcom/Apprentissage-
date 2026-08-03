import Link from "next/link";

/**
 * The learner backed out of Stripe Checkout. Nothing happened, and the page says
 * so plainly rather than treating an abandoned checkout as a failure.
 */
export default function BillingCancelPage() {
  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Paiement</span>
          <h1>Paiement abandonné</h1>
          <p>
            Aucun montant n'a été débité et rien n'a changé sur ton compte. Le socle de comptabilité
            générale reste entièrement accessible.
          </p>
        </div>
      </section>

      <section className="panel">
        <span className="section-label">Reprendre</span>
        <h2>Quand tu veux</h2>
        <p className="muted">
          <Link href="/billing" className="inline-link">
            Revoir l'offre
          </Link>
          {" · "}
          <Link href="/modules/comptabilite-generale" className="inline-link">
            Continuer la comptabilité générale
          </Link>
        </p>
      </section>
    </div>
  );
}
