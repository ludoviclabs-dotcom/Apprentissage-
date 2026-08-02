import Link from "next/link";
import { ReviewCard } from "@/components/forms/review-card";
import { getFeatures } from "@/lib/features";
import { getRevisionModel } from "@/lib/view-model";
import { getCurrentUser } from "@/lib/auth/current-user";

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
      <section className="page-header">
        <div>
          <span className="section-label">Revisions</span>
          <h1>A revoir aujourd'hui</h1>
          <p>
            La file remonte les items dus, du plus ancien au plus récent. La réponse reste masquée
            jusqu'à ce que tu demandes à la voir : c'est le rappel qui ancre, pas la relecture.
          </p>
        </div>
        <div className="hero-score">
          <span>Dus</span>
          <strong>{queue.dueCount}</strong>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Dans cette session</span>
          <strong>{queue.entries.length}</strong>
        </article>
        <article>
          <span>En attente</span>
          <strong>{remaining}</strong>
        </article>
        <article>
          <span>Planifiés</span>
          <strong>{queue.totalCount}</strong>
        </article>
        <article>
          <span>Remédiations</span>
          <strong>{model.remediations.length}</strong>
        </article>
      </section>

      {queue.persisted ? null : (
        <p className="muted">
          {features.persistence.reason ?? "Les révisions ne sont pas enregistrées dans cette configuration."}
          {" "}La planification reste calculée et affichée, mais elle repart du socle seedé à chaque
          rechargement.
        </p>
      )}

      {queue.entries.length === 0 ? (
        <section className="panel">
          <span className="section-label">File vide</span>
          <h2>Rien n'est dû pour le moment</h2>
          <p>
            Chaque item revient à sa date planifiée. En attendant, un exercice corrigé alimente
            directement la file.
          </p>
          <Link className="primary-action" href="/exercices">
            Faire un exercice
          </Link>
        </section>
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

      <section className="panel">
        <span className="section-label">Carnet d'erreurs</span>
        <h2>Reviser par erreur, pas seulement par chapitre</h2>
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
