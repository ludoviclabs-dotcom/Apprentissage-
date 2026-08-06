"use client";

import { useState } from "react";
import type { PublicCaseStep, PublicProgressiveCase } from "@finance/content-publication";
import { CorrectionPanel } from "@/components/compta-approfondie/correction-panel";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { CaseStepGradeResponse } from "@/components/compta-approfondie/grading-types";

/**
 * Le mini-cas progressif.
 *
 * UNE ÉTAPE S'OUVRE QUAND SES PRÉREQUIS SONT SATISFAITS — ou quand l'apprenant
 * décide d'abandonner et de voir la suite. Le verrou est pédagogique, pas
 * sécuritaire : rien de secret ne se trouve derrière, l'énoncé d'une étape ne
 * révèle pas la réponse de la précédente. Le forcer est donc un choix offert,
 * pas une faille — et l'interdire aurait bloqué un apprenant coincé sur l'étape 2
 * d'un cas qui en compte six.
 *
 * LES INDICES SONT GRADUÉS ET DEMANDÉS UN PAR UN. `hintCount` voyage avec la
 * page, les indices non : les charger tous d'avance aurait rendu la gradation
 * décorative, puisque les trois niveaux auraient été dans le source dès
 * l'ouverture.
 */

interface StepState {
  graded: CaseStepGradeResponse | null;
  hints: Array<{ level: number; hint: string }>;
  abandoned: boolean;
}

const EMPTY_STATE: StepState = { graded: null, hints: [], abandoned: false };

export function ProgressiveCaseView({
  chapter,
  kase
}: {
  chapter: string;
  kase: PublicProgressiveCase;
}) {
  const [states, setStates] = useState<Record<string, StepState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stateOf(stepId: string): StepState {
    return states[stepId] ?? EMPTY_STATE;
  }

  /** Une étape est ouverte si tous ses prérequis sont réussis, ou si elle a été forcée. */
  function isOpen(step: PublicCaseStep): boolean {
    if (stateOf(step.id).abandoned || stateOf(step.id).graded) {
      return true;
    }

    return step.prerequisiteStepIds.every((prerequisite) => stateOf(prerequisite).graded?.passed === true);
  }

  function patch(stepId: string, changes: Partial<StepState>): void {
    setStates((current) => ({ ...current, [stepId]: { ...stateOf(stepId), ...changes } }));
  }

  async function askHint(step: PublicCaseStep): Promise<void> {
    const current = stateOf(step.id);
    const level = current.hints.length + 1;

    if (busy || level > step.hintCount) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postJson<{ level: number; hint: string }>("/api/apprentissage/activites", {
      action: "revealHint",
      chapter,
      artifactId: kase.caseId,
      stepId: step.id,
      level
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    patch(step.id, { hints: [...current.hints, result.data] });
  }

  async function submit(step: PublicCaseStep, submission: Record<string, unknown>): Promise<void> {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postJson<CaseStepGradeResponse>("/api/apprentissage/activites", {
      action: "gradeCaseStep",
      chapter,
      artifactId: kase.caseId,
      stepId: step.id,
      submission
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    patch(step.id, { graded: result.data });
  }

  const completed = kase.steps.filter((step) => stateOf(step.id).graded !== null).length;
  const passed = kase.steps.filter((step) => stateOf(step.id).graded?.passed === true).length;
  const gradableSteps = kase.steps.filter((step) => step.exerciseType !== "short_answer").length;
  const allDone = completed === kase.steps.length;

  return (
    <article className="activity-card case-card">
      <h3>{kase.title}</h3>
      <p className="activity-statement">{kase.context}</p>

      {kase.sharedData.length > 0 ? (
        <>
          <h4>Données communes</h4>
          <dl className="vocabulary-list">
            {kase.sharedData.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      <div className="flashcard-progress">
        <progress value={completed} max={kase.steps.length} aria-label="Progression du mini-cas" />
        <span>
          {completed} / {kase.steps.length} étape{kase.steps.length > 1 ? "s" : ""} traitée
          {completed > 1 ? "s" : ""}
        </span>
      </div>

      <ol className="case-steps">
        {kase.steps.map((step, index) => {
          const state = stateOf(step.id);
          const open = isOpen(step);

          return (
            <li key={step.id} className={open ? "case-step" : "case-step case-step--locked"}>
              <h4>
                Étape {index + 1} — {step.objective}
              </h4>

              {!open ? (
                <div className="case-step-locked">
                  <p className="muted">
                    Cette étape s&apos;ouvre lorsque
                    {step.prerequisiteStepIds.length > 1 ? " les étapes précédentes sont réussies" : " l'étape précédente est réussie"}.
                  </p>
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => patch(step.id, { abandoned: true })}
                  >
                    Passer cette dépendance et consulter l&apos;étape
                  </button>
                </div>
              ) : (
                <>
                  <p>{step.statement}</p>

                  <CaseStepForm
                    step={step}
                    disabled={busy || state.graded !== null}
                    onSubmit={(submission) => submit(step, submission)}
                  />

                  {step.hintCount > 0 && state.graded === null ? (
                    <div className="case-hints">
                      {state.hints.map((hint) => (
                        <p key={hint.level} className="case-hint">
                          <strong>Indice {hint.level}</strong> — {hint.hint}
                        </p>
                      ))}
                      {state.hints.length < step.hintCount ? (
                        <button
                          type="button"
                          className="secondary-action"
                          onClick={() => askHint(step)}
                          disabled={busy}
                        >
                          Demander un indice ({state.hints.length + 1} sur {step.hintCount})
                        </button>
                      ) : (
                        <p className="muted">Tous les indices ont été donnés.</p>
                      )}
                    </div>
                  ) : null}

                  {state.graded ? (
                    <div aria-live="polite">
                      <Feedback
                        tone={
                          !state.graded.gradable ? "info" : state.graded.passed ? "success" : "error"
                        }
                      >
                        {state.graded.gradable
                          ? `${state.graded.score}/${state.graded.maxScore}`
                          : "Réponse déposée. Cette étape n'est pas notée automatiquement : comparez-la à la correction."}
                      </Feedback>
                      <CorrectionPanel
                        correction={state.graded.correction}
                        criteria={state.graded.criteria}
                        feedback={state.graded.feedback}
                        title="Correction de l'étape"
                      />
                    </div>
                  ) : null}

                  <SourceCitation sources={step.sources} />
                </>
              )}
            </li>
          );
        })}
      </ol>

      {error ? <Feedback tone="error">{error}</Feedback> : null}

      {allDone ? (
        <section className="case-synthesis">
          <h4>Synthèse</h4>
          <p>
            {passed} étape{passed > 1 ? "s" : ""} réussie{passed > 1 ? "s" : ""} sur{" "}
            {gradableSteps} notée{gradableSteps > 1 ? "s" : ""}.
          </p>
          <p className="muted">
            La synthèse rédigée du cas figure dans la correction de la dernière étape.
          </p>
        </section>
      ) : null}

      <SourceCitation sources={kase.sources} />
    </article>
  );
}

/** Le formulaire d'une étape, choisi par son type. */
function CaseStepForm({
  step,
  disabled,
  onSubmit
}: {
  step: PublicCaseStep;
  disabled: boolean;
  onSubmit: (submission: Record<string, unknown>) => void;
}) {
  const [value, setValue] = useState("");
  const [lines, setLines] = useState("");

  if (step.exerciseType === "journal_entry") {
    return (
      <form
        className="activity-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ kind: "journal_entry", lines: parseJournalLines(lines) });
        }}
      >
        <label htmlFor={`case-${step.id}`}>
          Écriture — une ligne par compte, au format <code>compte;débit;crédit</code>
        </label>
        <textarea
          id={`case-${step.id}`}
          value={lines}
          onChange={(event) => setLines(event.target.value)}
          rows={4}
          disabled={disabled}
          placeholder={"512;8000;\n163;;8000"}
        />
        <button
          type="submit"
          className="primary-action"
          disabled={disabled || parseJournalLines(lines).length < 2}
        >
          Valider l&apos;étape
        </button>
      </form>
    );
  }

  const kind =
    step.exerciseType === "calculation"
      ? "calculation"
      : step.exerciseType === "error_diagnosis"
        ? "error_diagnosis"
        : "short_answer";

  return (
    <form
      className="activity-form"
      onSubmit={(event) => {
        event.preventDefault();

        if (kind === "calculation") {
          onSubmit({ kind, raw: value.trim() });
        } else if (kind === "error_diagnosis") {
          onSubmit({ kind, category: value });
        } else {
          onSubmit({ kind, text: value.trim() });
        }
      }}
    >
      <label htmlFor={`case-${step.id}`}>
        {kind === "calculation"
          ? `Résultat${step.unit ? ` (${step.unit})` : ""}`
          : kind === "error_diagnosis"
            ? "Nature de l'erreur"
            : "Votre réponse"}
      </label>

      {kind === "short_answer" ? (
        <textarea
          id={`case-${step.id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          rows={4}
          disabled={disabled}
          maxLength={4000}
        />
      ) : kind === "error_diagnosis" ? (
        <select
          id={`case-${step.id}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
        >
          <option value="">Choisir…</option>
          {Object.entries(CASE_CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={`case-${step.id}`}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
        />
      )}

      {kind === "calculation" && step.tolerance !== undefined ? (
        <p className="muted">Tolérance ±{step.tolerance}.</p>
      ) : null}

      <button type="submit" className="primary-action" disabled={disabled || value.trim().length === 0}>
        Valider l&apos;étape
      </button>
    </form>
  );
}

const CASE_CATEGORY_LABELS: Record<string, string> = {
  wrong_account: "Mauvais compte",
  wrong_debit_credit_direction: "Mauvais sens débit/crédit",
  wrong_amount: "Mauvais montant",
  wrong_formula: "Mauvaise formule",
  missing_line: "Ligne manquante",
  wrong_date: "Mauvaise date",
  wrong_valuation_basis: "Mauvaise base de valorisation",
  double_counting: "Double comptabilisation",
  no_error: "Aucune erreur"
};

/**
 * `compte;débit;crédit`, une ligne par écriture.
 *
 * Une saisie textuelle plutôt qu'une grille : l'atelier d'écriture complet
 * existe déjà pour les exercices dédiés, et le dupliquer dans chaque étape de
 * cas alourdirait la page sans rien apporter. Les lignes illisibles sont
 * ignorées plutôt que devinées.
 */
function parseJournalLines(raw: string): Array<{ account: string; debit?: number; credit?: number }> {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [account = "", debit = "", credit = ""] = line.split(";").map((part) => part.trim());
      const toNumber = (value: string): number | undefined => {
        const parsed = Number(value.replace(/\s/g, "").replace(",", "."));

        return value.length > 0 && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
      };

      return { account, debit: toNumber(debit), credit: toNumber(credit) };
    })
    .filter((line) => /^\d{2,8}$/.test(line.account) && (line.debit !== undefined || line.credit !== undefined));
}
