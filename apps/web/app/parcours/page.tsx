import type { Metadata } from "next";
import Link from "next/link";
import { FeatureNotice } from "@/components/feature-notice";
import { LevelTrack } from "@/components/level-track";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeatures } from "@/lib/features";
import { getCanonicalLearningProgression } from "@/lib/learning-progression";

export const metadata: Metadata = {
  title: "Parcours",
  description:
    "Curricula versionnés, niveaux publiés, maîtrise et prochaines actions d'apprentissage."
};

const tierLabels = {
  fondations: "Fondations",
  application: "Application",
  maitrise: "Maîtrise"
} as const;

export default async function ParcoursPage() {
  const user = await getCurrentUser();
  const progression = await getCanonicalLearningProgression(user?.id);
  const features = getFeatures();

  return (
    <div className="page-stack">
      <PageHeader
        label="Parcours"
        title="Apprendre, s'entraîner, puis passer en conditions réelles"
        description="Le hub se lit comme une progression : notions guidées, exercices corrigés, révision active, examens courts puis cas métier avancés."
        aside={
          <Link className="primary-action" href="/revisions">
            Lancer les révisions
          </Link>
        }
      />

      <section className="tier-grid" aria-label="Paliers pedagogiques">
        {(Object.keys(tierLabels) as Array<keyof typeof tierLabels>).map((tier) => (
          <article key={tier} className="panel">
            <span className="section-label">{tierLabels[tier]}</span>
            <h2>{tier === "fondations" ? "Langage et reflexes" : tier === "application" ? "Methode et correction" : "Dossiers ambigus"}</h2>
            <p>
              {tier === "fondations"
                ? "Definitions, exemples resolus, cartes et exercices courts."
                : tier === "application"
                  ? "Problemes varies, justification et reprise ciblee des erreurs."
                  : "Examens, temps limite, business cases et decisions argumentees."}
            </p>
          </article>
        ))}
      </section>

      {progression.mode === "personal" ? null : (
        <FeatureNotice
          feature={{
            enabled: false,
            code: features.persistence.enabled ? "account-required" : "persistence-unavailable",
            publicMessage: features.persistence.enabled
              ? "Connecte-toi pour voir ta progression réelle : ces niveaux affichent l'état d'un parcours vierge."
              : `${features.persistence.publicMessage} Les niveaux affichent l'état d'un parcours vierge.`
          }}
        />
      )}

      {progression.tracks.map((track) => (
        <section
          key={track.track.trackId}
          className="page-stack"
          data-canonical-track={track.track.trackId}
          data-canonical-score={track.score ?? "neutral"}
        >
          <div className="panel-heading">
            <div>
              <span className="section-label">Curriculum publié</span>
              <h2>{track.track.title}</h2>
              <p>{track.track.description}</p>
            </div>
            {track.nextAction ? (
              <Link className="primary-action" href={track.nextAction.href}>
                {track.nextAction.label}
              </Link>
            ) : null}
          </div>
          <LevelTrack
            levels={track.levels.map((level) => level.definition)}
            snapshots={track.levels.map((level) => level.snapshot)}
            passingScore={track.passingScore}
            rulesLabel={track.sourceLabel}
          />
        </section>
      ))}
    </div>
  );
}
