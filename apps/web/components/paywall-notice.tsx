import Link from "next/link";
import type { EntitlementFeature } from "@finance/domain";
import { entitlementRefusalMessage } from "@/lib/billing/entitlements";

/**
 * What a locked module shows instead of its exercises.
 *
 * The two refusals are kept distinct because the fix is different: somebody
 * signed out needs the login page, somebody signed in needs the offer. A single
 * "accès refusé" would send half of them to the wrong place.
 */
export function PaywallNotice({
  reason,
  feature,
  moduleLabel
}: {
  reason: "anonymous" | "not-entitled";
  feature: EntitlementFeature;
  moduleLabel: string;
}) {
  return (
    <section className="panel" aria-label={`Accès premium requis : ${moduleLabel}`}>
      <span className="section-label">Module premium</span>
      <h2>{moduleLabel} est réservé aux abonnés</h2>
      <p>{entitlementRefusalMessage({ reason })}</p>
      <p className="muted">
        Le socle de comptabilité générale reste entièrement gratuit, y compris ses corrections et sa
        file de révision.
      </p>
      <p>
        {reason === "anonymous" ? (
          <Link href="/login" className="primary-action inline-link">
            Se connecter
          </Link>
        ) : (
          <Link href="/billing" className="primary-action inline-link">
            Voir l'offre
          </Link>
        )}
      </p>
      <p className="muted">Fonctionnalité concernée : {feature}.</p>
    </section>
  );
}
