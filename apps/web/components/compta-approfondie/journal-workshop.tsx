"use client";

import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { PublicJournalEntryExercise } from "@finance/content-publication";
import { CorrectionPanel } from "@/components/compta-approfondie/correction-panel";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { Feedback } from "@/components/ui/feedback";
import { postJson } from "@/lib/api-client";
import type { GradeResponse } from "@/components/compta-approfondie/grading-types";

/**
 * L'atelier d'écriture comptable.
 *
 * LA CORRECTION N'EST PAS UNE COMPARAISON DE TEXTE. Elle passe par
 * `journalEntryEvaluator`, qui vérifie séparément les comptes, le sens de chaque
 * ligne, les montants et l'équilibre — quatre erreurs différentes, quatre
 * retours différents. Comparer l'écriture entière à une chaîne attendue aurait
 * mis au même niveau une inversion débit/crédit et une faute de frappe dans un
 * libellé.
 *
 * L'ÉQUILIBRE EST CALCULÉ EN DIRECT, MAIS N'EST PAS LA NOTE. Les totaux se
 * mettent à jour à la saisie et l'écran prévient quand ils divergent : c'est une
 * aide, pas un verdict. Une écriture parfaitement équilibrée sur les mauvais
 * comptes reste fausse, et l'évaluateur le dit.
 */

interface DraftLine {
  /** Clé locale stable : réordonner ne doit pas remonter les champs de React. */
  key: string;
  account: string;
  label: string;
  debit: string;
  credit: string;
}

/**
 * Compteur de clés. Un compteur plutôt qu'un tirage : les clés doivent être
 * identiques au rendu serveur et au rendu client, et `Math.random()` en
 * produirait deux jeux différents.
 */
let nextLineKey = 0;

function emptyLine(): DraftLine {
  nextLineKey += 1;

  return { key: `line-${nextLineKey}`, account: "", label: "", debit: "", credit: "" };
}

/**
 * Saisie française : virgule décimale et espaces de milliers acceptés.
 *
 * `\s` couvre déjà l'espace insécable qu'un copier-coller depuis un tableur
 * apporte — il n'y a pas à le traiter à part.
 */
function parseAmount(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");

  if (cleaned.length === 0) {
    return 0;
  }

  const value = Number(cleaned);

  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

function formatTotal(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) : "—";
}

export function JournalWorkshop({
  chapter,
  exercise
}: {
  chapter: string;
  exercise: PublicJournalEntryExercise;
}) {
  const tableId = useId();
  const [lines, setLines] = useState<DraftLine[]>(() =>
    Array.from({ length: Math.max(2, Math.min(exercise.expectedLineCount, 6)) }, () => emptyLine())
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [graded, setGraded] = useState<GradeResponse | null>(null);

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + parseAmount(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + parseAmount(line.credit), 0);
    const rounded = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

    return {
      debit: rounded(debit),
      credit: rounded(credit),
      balanced: rounded(debit) === rounded(credit) && rounded(debit) > 0
    };
  }, [lines]);

  const filledLines = lines.filter(
    (line) => line.account.trim().length > 0 && (parseAmount(line.debit) > 0 || parseAmount(line.credit) > 0)
  );

  function update(key: string, patch: Partial<DraftLine>): void {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addLine(): void {
    setLines((current) => [...current, emptyLine()]);
  }

  function removeLine(key: string): void {
    // Une écriture comporte au moins deux lignes : en retirer la dernière
    // laisserait un formulaire impossible à soumettre.
    setLines((current) => (current.length <= 2 ? current : current.filter((line) => line.key !== key)));
  }

  function move(key: string, direction: -1 | 1): void {
    setLines((current) => {
      const index = current.findIndex((line) => line.key === key);
      const target = index + direction;

      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];

      return next;
    });
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    if (busy || filledLines.length < 2) {
      return;
    }

    setBusy(true);
    setError(null);

    const result = await postJson<GradeResponse>("/api/apprentissage/activites", {
      action: "gradeJournalEntry",
      chapter,
      artifactId: exercise.exerciseId,
      lines: filledLines.map((line) => {
        const debit = parseAmount(line.debit);
        const credit = parseAmount(line.credit);

        return {
          account: line.account.trim(),
          ...(debit > 0 ? { debit } : {}),
          ...(credit > 0 ? { credit } : {})
        };
      })
    });

    setBusy(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setGraded(result.data);
  }

  return (
    <article className="activity-card">
      <h3>{exercise.title}</h3>
      <p className="activity-statement">{exercise.statement}</p>
      <p className="muted">Date de l&apos;opération&nbsp;: {exercise.operationDate}</p>

      {exercise.contextualData.length > 0 ? (
        <dl className="vocabulary-list">
          {exercise.contextualData.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <form onSubmit={submit} className="activity-form">
        <div className="table-scroll">
          <table className="journal-table journal-editor" id={tableId}>
            <caption>
              Journal — {exercise.expectedLineCount} ligne{exercise.expectedLineCount > 1 ? "s" : ""}{" "}
              attendue{exercise.expectedLineCount > 1 ? "s" : ""}
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">N° de compte</th>
                <th scope="col">Libellé</th>
                <th scope="col">Débit</th>
                <th scope="col">Crédit</th>
                <th scope="col">
                  <span className="sr-only">Actions sur la ligne</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.key}>
                  <td>{index === 0 ? exercise.operationDate : ""}</td>
                  <td>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={line.account}
                      onChange={(event) => update(line.key, { account: event.target.value })}
                      disabled={graded !== null}
                      aria-label={`Numéro de compte, ligne ${index + 1}`}
                      maxLength={8}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={line.label}
                      onChange={(event) => update(line.key, { label: event.target.value })}
                      disabled={graded !== null}
                      aria-label={`Libellé, ligne ${index + 1}`}
                      maxLength={120}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.debit}
                      onChange={(event) => update(line.key, { debit: event.target.value, credit: "" })}
                      disabled={graded !== null}
                      aria-label={`Débit, ligne ${index + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={line.credit}
                      onChange={(event) => update(line.key, { credit: event.target.value, debit: "" })}
                      disabled={graded !== null}
                      aria-label={`Crédit, ligne ${index + 1}`}
                    />
                  </td>
                  <td className="journal-row-actions">
                    <button
                      type="button"
                      className="icon-action"
                      onClick={() => move(line.key, -1)}
                      disabled={graded !== null || index === 0}
                      aria-label={`Monter la ligne ${index + 1}`}
                    >
                      <ArrowUp size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-action"
                      onClick={() => move(line.key, 1)}
                      disabled={graded !== null || index === lines.length - 1}
                      aria-label={`Descendre la ligne ${index + 1}`}
                    >
                      <ArrowDown size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-action"
                      onClick={() => removeLine(line.key)}
                      disabled={graded !== null || lines.length <= 2}
                      aria-label={`Supprimer la ligne ${index + 1}`}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={3}>
                  Totaux
                </th>
                <td>{formatTotal(totals.debit)}</td>
                <td>{formatTotal(totals.credit)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {/* L'équilibre est annoncé en texte, pas seulement par une couleur de
            cellule : c'est l'information la plus utile de l'écran. */}
        <p aria-live="polite" className="journal-balance">
          {totals.debit === 0 && totals.credit === 0
            ? "Aucun montant saisi."
            : totals.balanced
              ? `Journal équilibré : ${formatTotal(totals.debit)} au débit comme au crédit.`
              : `Journal déséquilibré : ${formatTotal(totals.debit)} au débit contre ${formatTotal(totals.credit)} au crédit.`}
        </p>

        <div className="activity-input-row">
          <button type="button" className="secondary-action" onClick={addLine} disabled={graded !== null}>
            Ajouter une ligne
          </button>
          {graded ? (
            <button
              type="button"
              className="secondary-action"
              onClick={() => {
                setGraded(null);
                setError(null);
              }}
            >
              Refaire
            </button>
          ) : (
            <button type="submit" className="primary-action" disabled={busy || filledLines.length < 2}>
              Valider l&apos;écriture
            </button>
          )}
        </div>
      </form>

      <div aria-live="polite">
        {error ? <Feedback tone="error">{error}</Feedback> : null}

        {graded ? (
          <>
            <Feedback tone={graded.passed ? "success" : "error"}>
              {graded.score}/{graded.maxScore}
            </Feedback>
            <CorrectionPanel
              correction={graded.correction}
              criteria={graded.criteria}
              feedback={graded.feedback}
            />
          </>
        ) : null}
      </div>

      <SourceCitation sources={exercise.sources} />
    </article>
  );
}
