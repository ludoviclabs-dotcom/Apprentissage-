import { DomainBadge } from "@/components/domain-badge";
import { ProgressMeter } from "@/components/progress-meter";
import { SourceReference } from "@/components/source-reference";
import { getKnowledgeModel } from "@/lib/view-model";
import { getDomain } from "@finance/domain";

export default async function ConnaissancesPage() {
  const model = await getKnowledgeModel();

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <span className="section-label">Connaissances</span>
          <h1>Notions, formules, pieges et mini-exemples</h1>
          <p>La bibliotheque sert de base aux cartes, aux exercices et aux corrections sourcees.</p>
        </div>
        <div className="hero-score">
          <span>Cartes</span>
          <strong>{model.flashcards.length}</strong>
        </div>
      </section>

      <section className="concept-grid">
        {model.concepts.map((concept) => {
          const domain = getDomain(concept.domainId);

          return (
            <article key={concept.id} className="panel concept-card">
              <div className="panel-heading">
                <div>
                  <DomainBadge domainId={concept.domainId} />
                  <h2>{concept.title}</h2>
                </div>
                <strong>{concept.strength}%</strong>
              </div>
              <p>{concept.shortDefinition}</p>
              {concept.formula ? (
                <div className="expected-answer">
                  <strong>Formule</strong>
                  <p>{concept.formula}</p>
                </div>
              ) : null}
              <div className="logic-grid compact-grid">
                <article>
                  <span>Piege</span>
                  <p>{concept.frequentTrap}</p>
                </article>
                <article>
                  <span>Mini-exemple</span>
                  <p>{concept.miniExample}</p>
                </article>
              </div>
              <ProgressMeter value={concept.strength} color={domain.accent} label={`Maitrise ${concept.title}`} />
              <SourceReference sources={concept.sourceReferences} />
            </article>
          );
        })}
      </section>
    </div>
  );
}
