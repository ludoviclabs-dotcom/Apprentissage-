"use client";

import { useState } from "react";
import type {
  CalculationExercise,
  ContentDraft,
  ErrorDiagnosisExercise,
  GeneratedFlashcard,
  JournalEntryExercise,
  ProgressiveCase,
  SmartRevisionSheet
} from "@finance/content-generation";

/**
 * Aperçus pédagogiques de la file de revue.
 *
 * Ils montrent le contenu tel qu'il serait rendu à un apprenant, pour qu'un
 * relecteur juge sur pièce plutôt que sur du JSON. Ils restent internes à
 * l'administration : aucun de ces composants n'est monté sur une route publique.
 */

function formatAmount(value: number): string {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function SheetPreview({ sheet }: { sheet: SmartRevisionSheet }) {
  return (
    <div className="review-preview">
      <h3>{sheet.title}</h3>
      <p className="muted">
        {sheet.chapter} · difficulté {sheet.difficulty}/5 · {sheet.estimatedMinutes} min
      </p>

      <section>
        <h4>Objectif</h4>
        <p>{sheet.learningObjective}</p>
      </section>

      {sheet.prerequisites.length > 0 ? (
        <section>
          <h4>Prérequis</h4>
          <ul>
            {sheet.prerequisites.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h4>Règles essentielles</h4>
        <ul>
          {sheet.essentialRules.map((rule) => (
            <li key={rule.statement}>
              {rule.statement}
              {rule.rationale ? <div className="muted">{rule.rationale}</div> : null}
            </li>
          ))}
        </ul>
      </section>

      {sheet.accountMap.length > 0 ? (
        <section>
          <h4>Carte des comptes</h4>
          <div className="table-scroll">
            <table className="review-table">
              <thead>
                <tr>
                  <th scope="col">Compte</th>
                  <th scope="col">Libellé</th>
                  <th scope="col">Emploi</th>
                  <th scope="col">Sens</th>
                </tr>
              </thead>
              <tbody>
                {sheet.accountMap.map((account) => (
                  <tr key={`${account.accountNumber}-${account.label}`}>
                    <td>{account.accountNumber}</td>
                    <td>{account.label}</td>
                    <td>{account.usage}</td>
                    <td>{account.side === "both" ? "débit / crédit" : account.side === "debit" ? "débit" : "crédit"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {sheet.formulas.length > 0 ? (
        <section>
          <h4>Formules</h4>
          <ul>
            {sheet.formulas.map((formula) => (
              <li key={formula.name}>
                <strong>{formula.name}</strong> — <code>{formula.expression}</code> ({formula.unit})
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {sheet.timelineSteps.length > 0 ? (
        <section>
          <h4>Chronologie</h4>
          <ol>
            {sheet.timelineSteps
              .slice()
              .sort((left, right) => left.order - right.order)
              .map((step) => (
                <li key={`${step.order}-${step.moment}`}>
                  <strong>{step.moment}</strong> — {step.action}
                  {step.accountsInvolved.length > 0 ? (
                    <span className="muted"> ({step.accountsInvolved.join(", ")})</span>
                  ) : null}
                </li>
              ))}
          </ol>
        </section>
      ) : null}

      <section>
        <h4>Exemple résolu — {sheet.workedExample.title}</h4>
        <ol>
          {sheet.workedExample.steps.map((step) => (
            <li key={step.kind + step.title}>
              <strong>{step.title}</strong>
              <div>{step.content}</div>
            </li>
          ))}
        </ol>
      </section>

      {sheet.commonMistakes.length > 0 ? (
        <section>
          <h4>Erreurs fréquentes</h4>
          <ul>
            {sheet.commonMistakes.map((mistake) => (
              <li key={mistake.mistake}>
                {mistake.mistake}
                <div className="muted">→ {mistake.correction}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h4>Questions de rappel</h4>
        <ul>
          {sheet.activeRecallQuestions.map((question) => (
            <li key={question.question}>
              {question.question}
              <div className="muted">{question.answer}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Synthèse</h4>
        <p>{sheet.summary}</p>
      </section>
    </div>
  );
}

function FlashcardPreview({ card }: { card: GeneratedFlashcard }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="review-preview">
      <p className="muted">
        {card.type} · difficulté {card.difficulty}/5
      </p>

      <section>
        <h4>Recto</h4>
        <p>{card.front}</p>
      </section>

      {revealed ? (
        <>
          <section>
            <h4>Verso</h4>
            <p>{card.back}</p>
          </section>
          <section>
            <h4>Explication</h4>
            <p>{card.explanation}</p>
          </section>
        </>
      ) : (
        <button type="button" className="secondary-action" onClick={() => setRevealed(true)}>
          Révéler la réponse
        </button>
      )}

      <p className="muted">Objectif : {card.learningObjective}</p>
      {card.tags.length > 0 ? <p className="muted">Étiquettes : {card.tags.join(", ")}</p> : null}
    </div>
  );
}

function CalculationPreview({ exercise }: { exercise: CalculationExercise }) {
  return (
    <div className="review-preview">
      <h3>{exercise.title}</h3>
      <p>{exercise.statement}</p>

      <section>
        <h4>Données</h4>
        <ul>
          {exercise.variables.map((variable) => (
            <li key={variable.name}>
              {variable.label} : {formatAmount(variable.value)} {variable.unit}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Réponse attendue</h4>
        <p>
          <strong>
            {formatAmount(exercise.expectedAnswer)} {exercise.unit}
          </strong>{" "}
          <span className="muted">
            (tolérance ± {exercise.tolerance}, arrondi {exercise.roundingRule}, calcul{" "}
            <code>{exercise.formulaTemplateId}</code>)
          </span>
        </p>
      </section>

      <section>
        <h4>Étapes</h4>
        <ol>
          {exercise.calculationSteps
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((step) => (
              <li key={step.order}>
                {step.description}
                {step.expression ? (
                  <div>
                    <code>{step.expression}</code>
                    {step.intermediateResult !== undefined ? ` = ${formatAmount(step.intermediateResult)}` : null}
                  </div>
                ) : null}
              </li>
            ))}
        </ol>
      </section>

      <section>
        <h4>Explication</h4>
        <p>{exercise.explanation}</p>
      </section>
    </div>
  );
}

function JournalEntryTable({
  lines,
  operationDate
}: {
  lines: JournalEntryExercise["expectedLines"];
  operationDate: string;
}) {
  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);

  return (
    <div className="table-scroll">
      <table className="review-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Compte</th>
            <th scope="col">Libellé</th>
            <th scope="col">Débit</th>
            <th scope="col">Crédit</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${line.accountNumber}-${index}`}>
              <td>{index === 0 ? operationDate : ""}</td>
              <td>{line.accountNumber}</td>
              <td>{line.accountLabel}</td>
              <td>{line.debit > 0 ? formatAmount(line.debit) : ""}</td>
              <td>{line.credit > 0 ? formatAmount(line.credit) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}>Totaux</td>
            <td>{formatAmount(totalDebit)}</td>
            <td>{formatAmount(totalCredit)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function JournalEntryPreview({ exercise }: { exercise: JournalEntryExercise }) {
  return (
    <div className="review-preview">
      <h3>{exercise.title}</h3>
      <p>{exercise.statement}</p>

      {exercise.contextualData.length > 0 ? (
        <section>
          <h4>Données</h4>
          <ul>
            {exercise.contextualData.map((item) => (
              <li key={item.label}>
                {item.label} : {item.value}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h4>Écriture attendue</h4>
        <JournalEntryTable lines={exercise.expectedLines} operationDate={exercise.operationDate} />
        <p className="muted">Comptes exigés : {exercise.requiredAccounts.join(", ")}</p>
      </section>

      <section>
        <h4>Explication</h4>
        <p>{exercise.explanation}</p>
      </section>
    </div>
  );
}

function ErrorDiagnosisPreview({ exercise }: { exercise: ErrorDiagnosisExercise }) {
  return (
    <div className="review-preview">
      <h3>{exercise.title}</h3>
      <p>{exercise.scenario}</p>

      {exercise.proposedEntry ? (
        <section>
          <h4>Écriture proposée (à examiner)</h4>
          <JournalEntryTable lines={exercise.proposedEntry} operationDate="" />
        </section>
      ) : null}

      {exercise.proposedAnswer ? (
        <section>
          <h4>Réponse proposée (à examiner)</h4>
          <p>{exercise.proposedAnswer}</p>
        </section>
      ) : null}

      <section>
        <h4>Choix offerts</h4>
        <ul>
          {exercise.errorCategories.map((category) => (
            <li key={category}>
              {category}
              {category === exercise.expectedErrorCategory ? <strong> — réponse attendue</strong> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Correction attendue</h4>
        <p>{exercise.expectedCorrection}</p>
      </section>

      <p className="muted">
        La correction rédigée par l&apos;apprenant n&apos;est pas notée automatiquement dans cette version : seule la
        catégorie choisie l&apos;est.
      </p>
    </div>
  );
}

function ProgressiveCasePreview({ kase }: { kase: ProgressiveCase }) {
  return (
    <div className="review-preview">
      <h3>{kase.title}</h3>
      <p>{kase.context}</p>
      <p className="muted">
        {kase.steps.length} étapes · difficulté {kase.difficulty}/5 · {kase.estimatedMinutes} min
      </p>

      {kase.sharedData.length > 0 ? (
        <section>
          <h4>Données communes</h4>
          <ul>
            {kase.sharedData.map((item) => (
              <li key={item.label}>
                {item.label} : {item.value}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h4>Progression</h4>
        <ol>
          {kase.steps
            .slice()
            .sort((left, right) => left.order - right.order)
            .map((step) => (
              <li key={step.id}>
                <strong>{step.objective}</strong>
                <div>{step.statement}</div>
                <div className="muted">
                  Type : {step.exerciseType}
                  {step.prerequisiteStepIds.length > 0
                    ? ` · dépend de : ${step.prerequisiteStepIds.join(", ")}`
                    : " · aucune dépendance"}
                  {` · barème ${step.gradingRubric.reduce((sum, item) => sum + item.points, 0)} pts`}
                </div>

                {step.answerSpecification.kind === "calculation" ? (
                  <div className="muted">
                    Réponse : {formatAmount(step.answerSpecification.expectedValue)} {step.answerSpecification.unit}
                  </div>
                ) : null}

                {step.answerSpecification.kind === "journal_entry" ? (
                  <JournalEntryTable lines={step.answerSpecification.expectedLines} operationDate="" />
                ) : null}

                {step.hintLevels.length > 0 ? (
                  <details>
                    <summary>Indices ({step.hintLevels.length})</summary>
                    <ol>
                      {step.hintLevels
                        .slice()
                        .sort((left, right) => left.level - right.level)
                        .map((hint) => (
                          <li key={hint.level}>{hint.hint}</li>
                        ))}
                    </ol>
                  </details>
                ) : null}

                <details>
                  <summary>Corrigé</summary>
                  <p>{step.explanation}</p>
                </details>
              </li>
            ))}
        </ol>
      </section>

      <section>
        <h4>Synthèse finale</h4>
        <p>{kase.finalSynthesis}</p>
      </section>
    </div>
  );
}

export function ContentPreview({ draft }: { draft: ContentDraft }) {
  switch (draft.contentType) {
    case "smart_revision_sheet":
      return <SheetPreview sheet={draft.content} />;
    case "flashcard":
      return <FlashcardPreview card={draft.content} />;
    case "calculation_exercise":
      return <CalculationPreview exercise={draft.content} />;
    case "journal_entry_exercise":
      return <JournalEntryPreview exercise={draft.content} />;
    case "error_diagnosis_exercise":
      return <ErrorDiagnosisPreview exercise={draft.content} />;
    case "progressive_case":
      return <ProgressiveCasePreview kase={draft.content} />;
  }
}
