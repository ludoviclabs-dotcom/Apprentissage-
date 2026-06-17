import { RevisionReviewForm } from "@/components/forms/revision-review-form";
import { SourceReference } from "@/components/source-reference";
import { getRevisionModel } from "@/lib/view-model";

export default async function RevisionsPage() {
  const model = await getRevisionModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Revisions</span>
          <h1>A revoir aujourd'hui</h1>
          <p>
            La session remonte les cartes dues, les cartes nouvelles et les notions fragiles pour ancrer la
            memorisation dans le temps.
          </p>
        </div>
        <div className="hero-score">
          <span>Dues</span>
          <strong>{model.session.dueCount}</strong>
        </div>
      </section>

      <section className="metric-strip">
        <article>
          <span>Nouvelles</span>
          <strong>{model.session.newCount}</strong>
        </article>
        <article>
          <span>Fragiles</span>
          <strong>{model.session.fragileCount}</strong>
        </article>
        <article>
          <span>Maitrisees</span>
          <strong>{model.session.masteredCount}</strong>
        </article>
        <article>
          <span>Carnet erreurs</span>
          <strong>{model.errorJournal.length}</strong>
        </article>
      </section>

      <section className="flashcard-grid">
        {model.session.cards.map((card) => (
          <article key={card.id} className="panel flashcard">
            <div className="panel-heading">
              <div>
                <span className="section-label">{card.type}</span>
                <h2>{card.front}</h2>
              </div>
              <span className={`state-token ${card.status === "due" ? "needs-review" : card.status === "mastered" ? "ready" : "processing"}`}>
                {card.status}
              </span>
            </div>
            <div className="expected-answer">
              <strong>Reponse attendue</strong>
              <p>{card.back}</p>
            </div>
            <p>{card.explanation}</p>
            <RevisionReviewForm flashcardId={card.id} />
            <SourceReference sources={card.sourceReferences} />
          </article>
        ))}
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
