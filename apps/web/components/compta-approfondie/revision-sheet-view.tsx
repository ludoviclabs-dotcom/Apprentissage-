import Link from "next/link";
import {
  ActiveRecall,
  CopyableFormula,
  PrintButton,
  RuleChecklist
} from "@/components/compta-approfondie/sheet-tools";
import { SourceCard, SourceCitation } from "@/components/compta-approfondie/source-list";
import { chapterUrl, type PublicSheetView } from "@/lib/publication/chapter";

/**
 * La fiche de révision 2.0, dans l'ordre que le cahier des charges impose :
 * objectif, prérequis, règles, comptes, formules, frise, exemple résolu, erreurs
 * fréquentes, rappel actif, synthèse, sources.
 *
 * ELLE S'IMPRIME. `styles/print.css` retire la navigation, les onglets et les
 * boutons, déplie tout ce qui est replié et empêche une règle ou une formule
 * d'être coupée en deux par un saut de page. C'est la seule sortie « papier »
 * de ce lot : aucun PDF n'est produit, faute d'infrastructure fiable pour le
 * faire — `pdf-lib` sert les attestations, dont la mise en page est fixe, et
 * porter une fiche de longueur variable dessus serait un lot à part entière.
 *
 * Composant serveur, sauf trois îlots : le rappel actif (révéler une réponse),
 * la copie d'une formule et le suivi des règles comprises. Tout le reste est du
 * texte.
 */
export function RevisionSheetView({ view, chapter }: { view: PublicSheetView; chapter: string }) {
  const { sheet } = view;

  return (
    <article className="revision-sheet">
      <header className="revision-sheet-header">
        <h2>{sheet.title}</h2>
        <p className="muted">
          {sheet.chapter} · difficulté {sheet.difficulty}/5 · environ {sheet.estimatedMinutes} min ·
          version publiée {view.publicationVersion}
        </p>
        <p className="no-print">
          <PrintButton />
        </p>
      </header>

      <section className="panel">
        <h3 className="panel-heading">1. Objectif</h3>
        <p>{sheet.learningObjective}</p>
      </section>

      {sheet.prerequisites.length > 0 ? (
        <section className="panel">
          <h3 className="panel-heading">2. Prérequis</h3>
          <ul className="bullet-list">
            {sheet.prerequisites.map((prerequisite) => (
              <li key={prerequisite}>{prerequisite}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h3 className="panel-heading">3. Règles essentielles</h3>
        <RuleChecklist
          chapter={chapter}
          rules={sheet.essentialRules.map((rule, index) => ({
            id: `${index}`,
            statement: rule.statement,
            rationale: rule.rationale,
            sources: rule.sourceReferences
          }))}
        />
      </section>

      {sheet.accountMap.length > 0 ? (
        <section className="panel">
          <h3 className="panel-heading">4. Carte des comptes</h3>
          <div className="table-scroll">
            <table className="account-table">
              <caption className="sr-only">Comptes du chapitre et leur emploi</caption>
              <thead>
                <tr>
                  <th scope="col">Compte</th>
                  <th scope="col">Intitulé</th>
                  <th scope="col">Emploi</th>
                  <th scope="col">Sens</th>
                </tr>
              </thead>
              <tbody>
                {sheet.accountMap.map((account) => (
                  <tr key={account.accountNumber}>
                    <th scope="row">{account.accountNumber}</th>
                    <td>{account.label}</td>
                    <td>{account.usage}</td>
                    <td>
                      {account.side === "debit"
                        ? "Débit"
                        : account.side === "credit"
                          ? "Crédit"
                          : "Débit ou crédit"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {sheet.formulas.length > 0 ? (
        <section className="panel">
          <h3 className="panel-heading">5. Formules</h3>
          {sheet.formulas.map((formula) => (
            <article key={formula.name} className="formula-card">
              <h4>{formula.name}</h4>
              <CopyableFormula expression={formula.expression} name={formula.name} />
              <dl className="vocabulary-list">
                {formula.variableDefinitions.map((variable) => (
                  <div key={variable.symbol}>
                    <dt>{variable.symbol}</dt>
                    <dd>
                      {variable.meaning}
                      {variable.unit ? ` (${variable.unit})` : ""}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="muted">
                Unité&nbsp;: {formula.unit} · Arrondi&nbsp;: {formula.roundingRule}
              </p>
              <SourceCitation sources={formula.sourceReferences} />
            </article>
          ))}
        </section>
      ) : null}

      {sheet.timelineSteps.length > 0 ? (
        <section className="panel">
          <h3 className="panel-heading">6. Frise chronologique</h3>
          <ol className="timeline">
            {[...sheet.timelineSteps]
              .sort((left, right) => left.order - right.order)
              .map((step) => (
                <li key={`${step.order}-${step.moment}`} className="timeline-step">
                  <h4>
                    <span className="timeline-rank" aria-hidden="true">
                      {step.order}
                    </span>
                    {step.moment}
                  </h4>
                  <p>{step.action}</p>
                  {step.accountsInvolved.length > 0 ? (
                    <p className="muted">Comptes&nbsp;: {step.accountsInvolved.join(", ")}</p>
                  ) : null}
                  <SourceCitation sources={step.sourceReferences} />
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      <section className="panel">
        <h3 className="panel-heading">7. Exemple résolu pas à pas</h3>
        <h4>{sheet.workedExample.title}</h4>
        <ol className="worked-example">
          {sheet.workedExample.steps.map((step, index) => (
            <li key={`${index}-${step.title}`}>
              <h5>{step.title}</h5>
              <p>{step.content}</p>
            </li>
          ))}
        </ol>
        <SourceCitation sources={sheet.workedExample.sourceReferences} />
      </section>

      {sheet.commonMistakes.length > 0 ? (
        <section className="panel">
          <h3 className="panel-heading">8. Erreurs fréquentes</h3>
          <ul className="mistake-list">
            {sheet.commonMistakes.map((mistake, index) => (
              <li key={`${index}-${mistake.mistake.slice(0, 24)}`}>
                <p className="mistake">{mistake.mistake}</p>
                <p className="correction">{mistake.correction}</p>
                <SourceCitation sources={mistake.sourceReferences} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel">
        <h3 className="panel-heading">9. Questions de rappel actif</h3>
        <ActiveRecall
          chapter={chapter}
          artifactId={view.artifactId}
          questions={sheet.activeRecallQuestions.map((question, index) => ({
            id: `${index}`,
            question: question.question,
            answer: question.answer,
            sources: question.sourceReferences
          }))}
        />
      </section>

      <section className="panel">
        <h3 className="panel-heading">10. Synthèse</h3>
        <p>{sheet.summary}</p>
      </section>

      <section className="panel">
        <h3 className="panel-heading">11. Sources</h3>
        <div className="source-grid">
          {view.sources.map((reference, index) => (
            <SourceCard key={`${reference.documentId}-${reference.pageStart}-${index}`} reference={reference} />
          ))}
        </div>
      </section>

      <p className="no-print">
        <Link className="primary-action" href={chapterUrl(chapter, "entrainer")}>
          Passer aux exercices
        </Link>{" "}
        <Link className="secondary-action" href={chapterUrl(chapter, "reviser")}>
          Réviser les cartes
        </Link>
      </p>
    </article>
  );
}
