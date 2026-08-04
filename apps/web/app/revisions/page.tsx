import type { Metadata } from "next";
import Link from "next/link";
import { ReviewCard } from "@/components/forms/review-card";
import { LegacyHashRedirect } from "@/components/legacy-hash-redirect";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { PUBLIC_DEMO_TITLE, getFeatures } from "@/lib/features";
import { getRevisionModel } from "@/lib/view-model";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Réviser — Session du jour",
  description:
    "La file des items dus : réponse masquée jusqu'à la révélation, remédiations datées et carnet d'erreurs."
};

/**
 * Active review.
 *
 * The page renders prompts and never answers: `ReviewQueueEntry` carries no
 * `answer` field at all, so there is nothing here to accidentally leak into the
 * HTML. Revealing is a request the learner makes, handled by `ReviewCard`.
 *
 * En mode découverte, les cartes restent pleinement utilisables : la révélation
 * est une lecture, et l'auto-évaluation est calculée dans le navigateur. La page
 * n'affiche plus aucun message de configuration — la notice unique du shell dit
 * déjà ce qui est enregistré, une fois, en haut.
 */
export default async function RevisionsPage() {
  const user = await getCurrentUser();
  const model = await getRevisionModel(user?.id);
  const features = getFeatures();
  const { queue } = model;
  const personal = user !== null;
  const remaining = Math.max(0, queue.dueCount - queue.entries.length);
  const mode = features.writes.enabled ? "persisted" : "local";

  return (
    <div className="page-stack">
      {/* Les anciens liens pointaient vers /revisions#carnet-erreurs. Le carnet
          a maintenant sa route ; l'ancre reste honorée par une redirection. */}
      <LegacyHashRedirect hash="carnet-erreurs" href="/revisions/carnet-erreurs" />

      <PageHeader
        label="Révisions"
        title={personal ? "À revoir aujourd'hui" : "Exemple de session de révision"}
        description={
          personal
            ? "La file remonte les items dus, du plus ancien au plus récent. La réponse reste masquée jusqu'à ce que tu demandes à la voir : c'est le rappel qui ancre, pas la relecture."
            : "Ces cartes illustrent le rappel actif. Révèle la réponse, puis auto-évalue-toi : la planification est simulée et n'est attribuée à personne."
        }
        aside={
          <div className="hero-score">
            <span>{personal ? "Dus" : "Mode"}</span>
            <strong>{personal ? queue.dueCount : PUBLIC_DEMO_TITLE}</strong>
          </div>
        }
      />

      {personal ? (
        <section className="stat-strip" aria-label="Volumes de la session">
          <StatCard label="Dans cette session" value={queue.entries.length} tone="accent" />
          <StatCard label="En attente" value={remaining} />
          <StatCard label="Planifiés" value={queue.totalCount} />
          <StatCard
            label="Remédiations"
            value={model.remediations.length}
            tone={model.remediations.length > 0 ? "warning" : "neutral"}
          />
        </section>
      ) : null}

      {queue.entries.length === 0 ? (
        <EmptyState
          title="Rien n'est dû pour le moment"
          description="Chaque item revient à sa date planifiée. En attendant, un exercice corrigé alimente directement la file."
          action={
            <Link className="primary-action inline-link" href="/exercices">
              Faire un exercice
            </Link>
          }
        />
      ) : (
        <section className="flashcard-grid">
          {queue.entries.map((entry) => (
            <ReviewCard
              key={`${entry.itemType}:${entry.itemRef}`}
              itemType={entry.itemType}
              itemRef={entry.itemRef}
              kindLabel={entry.kindLabel}
              prompt={entry.prompt}
              dueAt={entry.dueAt}
              lapseCount={entry.lapseCount}
              reviewCount={entry.reviewCount}
              personal={personal}
              mode={mode}
              persistence={features.persistence}
            />
          ))}
        </section>
      )}

      <section className="panel">
        <span className="section-label">Remédiation</span>
        <h2>Ce qu'un oubli déclenche</h2>
        {model.remediations.length === 0 ? (
          <p className="muted">
            Aucune remédiation ouverte. Une réponse notée « Pas su » — ou un exercice sous 10/20 —
            en crée une, avec un retest daté.
          </p>
        ) : (
          <div className="priority-list">
            {model.remediations.map((task) => (
              <article key={task.id} className="priority-row">
                <span className="state-token needs-review">{task.reason}</span>
                <div>
                  <strong>{task.microLesson}</strong>
                  <p>{task.nextAction}</p>
                  <small>
                    Retest le {task.dueAt.slice(0, 10)}
                    {task.competencyId ? ` · ${task.competencyId}` : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        )}
        <Link className="secondary-action inline-link" href="/revisions/carnet-erreurs">
          Ouvrir le carnet d'erreurs
        </Link>
      </section>
    </div>
  );
}
