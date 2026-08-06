import Link from "next/link";
import type { SmartRevisionSheet } from "@finance/content-generation";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { chapterUrl } from "@/lib/publication/chapter";

/**
 * L'onglet « Comprendre ».
 *
 * IL N'AJOUTE RIEN AU CONTENU VALIDÉ. Chaque section est rendue si — et
 * seulement si — l'instantané la renseigne : une chronologie absente donne une
 * section absente, pas une chronologie type. La tentation inverse est réelle
 * (« un emprunt obligataire comporte toujours une étape de souscription ») et
 * c'est exactement ce que le cahier des charges interdit : ajouter une étape que
 * les sources ne portent pas revient à inventer du cours.
 *
 * Il n'y a donc pas d'état vide global : si la fiche existe, elle a au moins un
 * objectif et une règle — le schéma l'exige. Ce sont les sections optionnelles
 * qui disparaissent une à une.
 *
 * Composant serveur : rien ici n'est interactif au-delà du repli natif de
 * `<details>`, qui fonctionne sans JavaScript et se laisse ouvrir au clavier.
 */
export function UnderstandView({ sheet, chapter }: { sheet: SmartRevisionSheet; chapter: string }) {
  const sections: Array<{ id: string; label: string; present: boolean }> = [
    { id: "objectif", label: "Objectif", present: true },
    { id: "prerequis", label: "Prérequis", present: sheet.prerequisites.length > 0 },
    { id: "vocabulaire", label: "Vocabulaire essentiel", present: sheet.accountMap.length > 0 },
    { id: "regles", label: "Règles principales", present: sheet.essentialRules.length > 0 },
    { id: "chronologie", label: "Chronologie", present: sheet.timelineSteps.length > 0 },
    { id: "comptes", label: "Carte des comptes", present: sheet.accountMap.length > 0 },
    { id: "formules", label: "Formules", present: sheet.formulas.length > 0 },
    { id: "exemple", label: "Exemple introductif", present: true },
    { id: "erreurs", label: "Erreurs fréquentes", present: sheet.commonMistakes.length > 0 }
  ];

  const visible = sections.filter((section) => section.present);

  return (
    <div className="understand-layout">
      <nav className="chapter-toc" aria-label="Sommaire">
        <h2>Sommaire</h2>
        <ol>
          {visible.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`}>{section.label}</a>
            </li>
          ))}
        </ol>
        <p className="muted">
          <Link href={chapterUrl(chapter, "fiche")}>Voir la fiche complète</Link>
        </p>
      </nav>

      <div className="understand-main">
        <section className="panel" id="objectif">
          <h2 className="panel-heading">Objectif d&apos;apprentissage</h2>
          <p>{sheet.learningObjective}</p>
        </section>

        {sheet.prerequisites.length > 0 ? (
          <section className="panel" id="prerequis">
            <h2 className="panel-heading">Prérequis</h2>
            <ul className="bullet-list">
              {sheet.prerequisites.map((prerequisite) => (
                <li key={prerequisite}>{prerequisite}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {sheet.accountMap.length > 0 ? (
          <section className="panel" id="vocabulaire">
            <h2 className="panel-heading">Vocabulaire essentiel</h2>
            <dl className="vocabulary-list">
              {sheet.accountMap.map((account) => (
                <div key={account.accountNumber}>
                  <dt>{account.label}</dt>
                  <dd>{account.usage}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {sheet.essentialRules.length > 0 ? (
          <section className="panel" id="regles">
            <h2 className="panel-heading">Règles principales</h2>
            <ol className="rule-list">
              {sheet.essentialRules.map((rule, index) => (
                <li key={`${index}-${rule.statement.slice(0, 24)}`}>
                  <p>{rule.statement}</p>
                  {rule.rationale ? <p className="muted">{rule.rationale}</p> : null}
                  <SourceCitation sources={rule.sourceReferences} />
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {sheet.timelineSteps.length > 0 ? (
          <section className="panel" id="chronologie">
            <h2 className="panel-heading">Chronologie de l&apos;opération</h2>
            <ol className="timeline">
              {[...sheet.timelineSteps]
                .sort((left, right) => left.order - right.order)
                .map((step) => (
                  <li key={`${step.order}-${step.moment}`} className="timeline-step">
                    <h3>
                      <span className="timeline-rank" aria-hidden="true">
                        {step.order}
                      </span>
                      {step.moment}
                    </h3>
                    <p>{step.action}</p>
                    {step.accountsInvolved.length > 0 ? (
                      <p className="muted">
                        Comptes concernés&nbsp;: {step.accountsInvolved.join(", ")}
                      </p>
                    ) : null}
                    <SourceCitation sources={step.sourceReferences} />
                  </li>
                ))}
            </ol>
          </section>
        ) : null}

        {sheet.accountMap.length > 0 ? (
          <section className="panel" id="comptes">
            <h2 className="panel-heading">Carte des comptes</h2>
            <div className="table-scroll">
              <table className="account-table">
                <caption className="sr-only">
                  Comptes du chapitre, leur emploi et leur sens habituel
                </caption>
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
          <section className="panel" id="formules">
            <h2 className="panel-heading">Formules</h2>
            {sheet.formulas.map((formula) => (
              <article key={formula.name} className="formula-card">
                <h3>{formula.name}</h3>
                <p className="formula-expression">
                  <code>{formula.expression}</code>
                </p>
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

        <section className="panel" id="exemple">
          <h2 className="panel-heading">Exemple introductif</h2>
          <h3>{sheet.workedExample.title}</h3>
          <ol className="worked-example">
            {sheet.workedExample.steps.map((step, index) => (
              <li key={`${index}-${step.title}`}>
                <h4>{step.title}</h4>
                <p>{step.content}</p>
              </li>
            ))}
          </ol>
          <SourceCitation sources={sheet.workedExample.sourceReferences} />
        </section>

        {sheet.commonMistakes.length > 0 ? (
          <section className="panel" id="erreurs">
            <h2 className="panel-heading">Erreurs fréquentes</h2>
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
          <h2 className="panel-heading">Et maintenant</h2>
          <p>
            <Link className="primary-action" href={chapterUrl(chapter, "entrainer")}>
              S&apos;entraîner
            </Link>{" "}
            <Link className="secondary-action" href={chapterUrl(chapter, "reviser")}>
              Réviser les cartes
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
