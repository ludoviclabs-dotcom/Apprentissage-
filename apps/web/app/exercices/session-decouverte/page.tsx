import type { Metadata } from "next";
import Link from "next/link";
import { DiscoverySession } from "@/components/forms/discovery-session";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import {
  DISCOVERY_SESSION_SUMMARY,
  DiscoverySessionUnavailableError,
  getDiscoverySteps,
  type DiscoveryStep
} from "@/lib/discovery-session";
import { getFeatures } from "@/lib/features";

export const metadata: Metadata = {
  title: "Session découverte — S'entraîner",
  description:
    "Cinq exercices guidés avec correction immédiate. Les résultats ne sont pas enregistrés."
};

/**
 * La session découverte.
 *
 * Le serveur ne fournit que les énoncés et les options ; les réponses attendues
 * restent côté serveur, notées par `/api/exercises/session-decouverte`. Un
 * énoncé et son corrigé dans le même payload feraient de la session un
 * questionnaire à réponses visibles dans le code source.
 *
 * Aucune écriture n'est déclenchée par cette page : ni tentative, ni événement
 * de maîtrise, ni file de révision. Le seul appel réseau qu'elle provoque est la
 * notation, qui ne persiste rien.
 */
export default async function DiscoverySessionPage() {
  const features = getFeatures();
  let steps: DiscoveryStep[];

  try {
    steps = await getDiscoverySteps();
  } catch (error) {
    if (!(error instanceof DiscoverySessionUnavailableError)) {
      throw error;
    }

    // Le catalogue ne porte plus les exercices annoncés. Mieux vaut le dire que
    // servir une session tronquée sous un titre qui promet cinq étapes.
    return (
      <div className="page-stack">
        <PageHeader
          label="S'entraîner"
          title="Session découverte"
          description="La session n'est pas disponible dans cette configuration."
        />
        <EmptyState
          title="Session indisponible"
          description="Les exercices de la session ne sont pas présents dans le catalogue chargé."
          action={
            <Link className="primary-action inline-link" href="/exercices">
              Revenir aux exercices
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        label="S'entraîner"
        title="Session découverte"
        description={DISCOVERY_SESSION_SUMMARY}
        aside={
          <div className="hero-score">
            <span>Étapes</span>
            <strong>{steps.length}</strong>
          </div>
        }
      />

      <DiscoverySession steps={steps} authEnabled={features.auth.enabled} />
    </div>
  );
}
