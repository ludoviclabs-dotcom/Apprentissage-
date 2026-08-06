"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy, Printer } from "lucide-react";
import type { PublicSourceReference } from "@finance/content-publication";
import { SourceCitation } from "@/components/compta-approfondie/source-list";
import { postJson } from "@/lib/api-client";

/**
 * Les trois îlots interactifs de la fiche : imprimer, copier une formule,
 * cocher une règle comprise. Regroupés dans un fichier parce qu'ils partagent la
 * même contrainte : ils n'apportent aucun contenu, ils ne font qu'outiller
 * celui que le serveur a déjà rendu.
 */

export function PrintButton() {
  return (
    <button type="button" className="secondary-action no-print" onClick={() => window.print()}>
      <Printer size={16} aria-hidden="true" /> Imprimer la fiche
    </button>
  );
}

/**
 * Copie une formule dans le presse-papiers.
 *
 * Le retour est textuel et annoncé (`role="status"`), pas seulement une couleur
 * de bouton : la confirmation doit atteindre un lecteur d'écran.
 */
export function CopyableFormula({ expression, name }: { expression: string; name: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2500);

    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(expression);
      setCopied(true);
    } catch {
      // Presse-papiers refusé (permission, contexte non sécurisé) : on ne
      // prétend pas avoir copié. L'expression reste sélectionnable à la main.
      setCopied(false);
    }
  }

  return (
    <p className="formula-expression">
      <code>{expression}</code>
      <button
        type="button"
        className="icon-action no-print"
        onClick={copy}
        aria-label={`Copier la formule « ${name} »`}
      >
        {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
      </button>
      <span role="status" className="sr-only">
        {copied ? `Formule « ${name} » copiée.` : ""}
      </span>
    </p>
  );
}

export interface ChecklistRule {
  id: string;
  statement: string;
  rationale?: string;
  sources: readonly PublicSourceReference[];
}

/**
 * Les règles, avec une case « comprise ».
 *
 * L'état est **local au navigateur** et ne prétend pas être une progression : il
 * n'alimente aucune maîtrise, parce que cocher une case n'est pas une preuve
 * d'apprentissage. C'est un marque-page, et il est présenté comme tel.
 */
export function RuleChecklist({ chapter, rules }: { chapter: string; rules: readonly ChecklistRule[] }) {
  const storageKey = `compta-approfondie:${chapter}:regles-comprises`;
  const [understood, setUnderstood] = useState<ReadonlySet<string>>(new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      setUnderstood(new Set(stored ? (JSON.parse(stored) as string[]) : []));
    } catch {
      setUnderstood(new Set());
    }

    setReady(true);
  }, [storageKey]);

  function toggle(id: string): void {
    setUnderstood((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Stockage indisponible (navigation privée) : la case reste cochée pour
        // la session, elle ne survivra pas au rechargement. Rien à signaler.
      }

      return next;
    });
  }

  return (
    <ol className="rule-list">
      {rules.map((rule) => (
        <li key={rule.id} className={understood.has(rule.id) ? "rule-understood" : undefined}>
          <p>{rule.statement}</p>
          {rule.rationale ? <p className="muted">{rule.rationale}</p> : null}
          <SourceCitation sources={rule.sources} />
          <label className="rule-check no-print">
            <input
              type="checkbox"
              checked={understood.has(rule.id)}
              onChange={() => toggle(rule.id)}
              disabled={!ready}
            />
            Règle comprise <span className="muted">(marque-page personnel, non comptabilisé)</span>
          </label>
        </li>
      ))}
    </ol>
  );
}

export interface RecallQuestion {
  id: string;
  question: string;
  answer: string;
  sources: readonly PublicSourceReference[];
}

/**
 * Rappel actif : une question, un effort de mémoire, puis la réponse.
 *
 * LA RÉPONSE EST DANS LA PAGE, ET C'EST ASSUMÉ. Contrairement aux flashcards —
 * qui sont notées et dont le verso est demandé au serveur — le rappel actif
 * d'une fiche n'alimente aucune note : la fiche est un document d'étude, et une
 * fiche imprimée doit porter ses réponses. Les masquer côté serveur aurait rendu
 * l'impression inutilisable pour un gain nul.
 *
 * Traiter une question enregistre en revanche une activité réelle, parce qu'un
 * rappel actif effectué est une dimension de la maîtrise du chapitre.
 */
export function ActiveRecall({
  chapter,
  artifactId,
  questions
}: {
  chapter: string;
  artifactId: string;
  questions: readonly RecallQuestion[];
}) {
  const groupId = useId();
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  const [recorded, setRecorded] = useState<ReadonlySet<string>>(new Set());

  async function reveal(question: RecallQuestion): Promise<void> {
    setRevealed((current) => new Set([...current, question.id]));

    if (recorded.has(question.id)) {
      return;
    }

    setRecorded((current) => new Set([...current, question.id]));

    // Le résultat de l'appel n'est pas attendu : un visiteur sans compte reçoit
    // un refus poli, et l'écran ne doit pas s'en trouver modifié.
    await postJson("/api/apprentissage/activites", {
      action: "record",
      chapter,
      kind: "active_recall",
      artifactId,
      succeeded: true
    });
  }

  return (
    <ol className="recall-list">
      {questions.map((question) => {
        const isRevealed = revealed.has(question.id);
        const answerId = `${groupId}-${question.id}`;

        return (
          <li key={question.id}>
            <p className="recall-question">{question.question}</p>

            <button
              type="button"
              className="secondary-action no-print"
              aria-expanded={isRevealed}
              aria-controls={answerId}
              onClick={() => reveal(question)}
            >
              {isRevealed ? "Masquer la réponse" : "Afficher la réponse"}
            </button>

            <div id={answerId} className={isRevealed ? "recall-answer" : "recall-answer print-only"}>
              <p>{question.answer}</p>
              <SourceCitation sources={question.sources} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
