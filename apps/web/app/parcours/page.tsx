import type { Metadata } from "next";
import Link from "next/link";
import { DomainBadge } from "@/components/domain-badge";
import { FeatureNotice } from "@/components/feature-notice";
import { LevelTrack } from "@/components/level-track";
import { ProgressMeter } from "@/components/progress-meter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeatures } from "@/lib/features";
import { getLevelTrackModel } from "@/lib/mastery-model";
import { statusLabel } from "@/lib/status-labels";
import { getPathModel } from "@/lib/view-model";
import { getDomain } from "@finance/domain";

export const metadata: Metadata = {
  title: "Parcours",
  description:
    "Le parcours de trente jours : paliers pédagogiques, niveaux à débloquer et modules d'apprentissage."
};

const tierLabels = {
  fondations: "Fondations",
  application: "Application",
  maitrise: "Maîtrise"
} as const;

export default async function ParcoursPage() {
  const user = await getCurrentUser();
  const [model, track] = await Promise.all([getPathModel(user?.id), getLevelTrackModel(user?.id)]);
  const features = getFeatures();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Parcours</span>
          <h1>Apprendre, s'entraîner, puis passer en conditions réelles</h1>
          <p>
            Le hub se lit comme une progression : notions guidées, exercices corrigés, révision active,
            examens courts puis cas métier avancés.
          </p>
        </div>
        <Link className="primary-action" href="/revisions">
          Lancer les révisions
        </Link>
      </section>

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

      <LevelTrack
        levels={track.levels}
        snapshots={track.snapshots}
        passingScore={track.passingScore}
        rulesLabel={track.rulesLabel}
      />

      {track.persisted ? null : (
        <FeatureNotice
          feature={{
            enabled: false,
            reason: features.persistence.enabled
              ? "Connecte-toi pour voir ta progression réelle : ces niveaux affichent l'état d'un parcours vierge."
              : `${features.persistence.reason} Les niveaux affichent l'état d'un parcours vierge.`
          }}
        />
      )}

      <section className="module-grid">
        {model.modules.map((module) => {
          const domain = getDomain(module.domainId);

          return (
            <article key={module.id} className="panel module-card">
              <div className="panel-heading">
                <div>
                  <DomainBadge domainId={module.domainId} />
                  <h2>{module.title}</h2>
                </div>
                <span className={`state-token ${module.status === "mastered" ? "ready" : module.status === "fragile" ? "needs-review" : "processing"}`}>
                  {statusLabel(module.status)}
                </span>
              </div>
              <p>{module.description}</p>
              <ProgressMeter value={module.progress} color={domain.accent} label={`Progression ${module.title}`} />
              <div className="module-meta">
                <span>{module.estimatedMinutes} min</span>
                <span>{module.conceptIds.length} notions</span>
                <span>{module.exerciseIds.length} exercices</span>
                <span>{module.flashcardIds.length} cartes</span>
              </div>
              <strong>Prochain pas</strong>
              <p>{module.nextAction}</p>
            </article>
          );
        })}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="section-label">30 jours</span>
            <h2>{model.learningPath.name}</h2>
          </div>
        </div>
        <div className="learning-days">
          {model.learningPath.days.map((day) => (
            <article key={day.day} className={`learning-day ${day.status}`}>
              <span>Jour {day.day}</span>
              <strong>{day.title}</strong>
              <small>
                {getDomain(day.domainId).shortName} · {day.minutes} min · {statusLabel(day.status)}
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
