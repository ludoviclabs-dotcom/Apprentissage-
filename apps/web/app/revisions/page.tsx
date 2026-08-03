import type { Metadata } from "next";
import Link from "next/link";
import { ReviewCard } from "@/components/forms/review-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getFeatures } from "@/lib/features";
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
 */
export default async function RevisionsPage() {
  const user = await getCurrentUser();
  const model = await getRevisionModel(user?.id);
  const features = getFeatures();
  const { queue } = model;
  const remaining = Math.max(0, queue.dueCount - queue.entries.length);

  return (
    <div className="page-stack">
      <PageHeader
        label="Révisions"
        title="À revoir aujourd'hui"
        description="La file remonte les items dus, du plus ancien au plus récent. La réponse reste masquée jusqu'à ce que tu demandes à la voir : c'est le rappel qui ancre, pas la relecture."
        aside={
          <div className="hero-score">
            <span>Dus</span>
            <strong>{queue.dueCount}</strong>
          </div>
        }
      />

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

      {queue.persisted ? null : (
        <p className="muted">
          {features.persistence.reason ?? "Les révisions ne sont pas enregistrées dans cette configuration."}
          {" "}La planification reste calculée et affichée, mais elle repart du socle seedé à chaque
          rechargement.
        </p>
      )}

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
              writes={features.writes}
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
      </section>

      <section className="panel" id="carnet-erreurs">
        <span className="section-label">Carnet d'erreurs</span>
        <h2>Réviser par erreur, pas seulement par chapitre</h2>
        <div className="priority-list">
          {model.errorJournal.map((entry) => (
            <article key={entry.id} className="priority-row">
              <span className="state-token needs-review">{entry.category}</span>
              <div>
                <strong>{entry.summary}</strong>
                <p>{entry.nextAction}</p>
                <small>{entry.competencyIds.join(", ")}</small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
