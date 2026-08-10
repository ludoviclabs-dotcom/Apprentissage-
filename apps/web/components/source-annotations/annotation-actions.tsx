"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StructuredFact, VisualAnnotation } from "@finance/content-generation";

/**
 * Les décisions humaines sur une annotation, et la correction qui les précède.
 *
 * Aucune action par défaut : aucun bouton n'est présélectionné, et il n'existe
 * pas d'action de lot — approuver dix-neuf transcriptions d'un clic reviendrait
 * à ne les avoir regardées d'aucune.
 *
 * CORRIGER ET APPROUVER RESTENT DEUX ACTES. Enregistrer une correction laisse
 * l'annotation en `needs_human_review` : la personne qui vient de réécrire une
 * transcription n'a pas, par ce geste, attesté qu'elle correspond à l'image.
 *
 * Aucune règle métier ne vit ici. Ce composant collecte des champs et appelle
 * l'API ; c'est `correctAnnotation` et la machine à états, côté domaine, qui
 * disent ce qui est permis. Dupliquer la règle en React la ferait diverger.
 */

type Confidence = "high" | "medium" | "low";

/** Les seuls champs qu'une correction humaine peut toucher. */
interface EditableState {
  transcription: string;
  confidence: Confidence | "";
  facts: StructuredFact[];
}

function initialState(annotation: VisualAnnotation): EditableState {
  return {
    transcription: annotation.transcription ?? "",
    confidence: annotation.confidence ?? "",
    facts: annotation.structuredFacts.map((fact) => ({ ...fact }))
  };
}

export function AnnotationActions({
  annotation,
  nextHref
}: {
  annotation: VisualAnnotation;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableState>(() => initialState(annotation));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function send(action: string, extra: Record<string, unknown> = {}): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSaved(false);

    const response = await fetch("/api/admin/source-annotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, annotationId: annotation.annotationId, ...extra })
    });

    setBusy(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { details?: string; error?: string };
      setError(payload.details ?? payload.error ?? "Action impossible");
      return false;
    }

    return true;
  }

  // Une annotation signée n'expose aucun chemin de correction : ni bouton, ni
  // raccourci. La règle est déjà appliquée par le domaine ; l'interface ne
  // propose simplement pas ce qui serait refusé.
  if (annotation.reviewStatus === "approved") {
    return (
      <p className="muted" role="status">
        Annotation signée — nouvelle révision requise pour toute correction.
      </p>
    );
  }

  if (editing) {
    return (
      <div className="review-actions">
        <h3>Corriger</h3>

        {error ? (
          <p className="muted" role="alert">
            {error}
          </p>
        ) : null}

        <label htmlFor={`transcription-${annotation.annotationId}`}>Transcription</label>
        <textarea
          id={`transcription-${annotation.annotationId}`}
          rows={4}
          value={draft.transcription}
          onChange={(event) => setDraft({ ...draft, transcription: event.target.value })}
        />

        <label htmlFor={`confidence-${annotation.annotationId}`}>Confiance</label>
        <select
          id={`confidence-${annotation.annotationId}`}
          value={draft.confidence}
          onChange={(event) => setDraft({ ...draft, confidence: event.target.value as Confidence | "" })}
        >
          <option value="">non évaluée</option>
          <option value="low">faible</option>
          <option value="medium">moyenne</option>
          <option value="high">élevée</option>
        </select>
        <p className="muted">
          La confiance ne se relève jamais d&apos;office : ne la passer à « élevée » que si la lecture
          est réellement certaine sur l&apos;image.
        </p>

        {draft.facts.length > 0 ? <h4>Faits relevés</h4> : null}
        {draft.facts.map((fact, index) => (
          <fieldset key={fact.factId}>
            <legend>{fact.factId}</legend>

            <label htmlFor={`label-${fact.factId}`}>Intitulé</label>
            <input
              id={`label-${fact.factId}`}
              value={fact.label}
              onChange={(event) => {
                const facts = [...draft.facts];
                facts[index] = { ...fact, label: event.target.value };
                setDraft({ ...draft, facts });
              }}
            />

            <label htmlFor={`value-${fact.factId}`}>Valeur</label>
            <input
              id={`value-${fact.factId}`}
              value={String(fact.value)}
              onChange={(event) => {
                const raw = event.target.value;
                // Une valeur numérique reste numérique : la retyper en chaîne
                // ferait échouer les contrôles déterministes en aval.
                const next =
                  typeof fact.value === "number" && raw.trim() !== "" && !Number.isNaN(Number(raw))
                    ? Number(raw)
                    : raw;
                const facts = [...draft.facts];
                facts[index] = { ...fact, value: next };
                setDraft({ ...draft, facts });
              }}
            />

            <label htmlFor={`unit-${fact.factId}`}>Unité</label>
            <input
              id={`unit-${fact.factId}`}
              value={fact.unit ?? ""}
              onChange={(event) => {
                const facts = [...draft.facts];
                facts[index] = { ...fact, unit: event.target.value === "" ? null : event.target.value };
                setDraft({ ...draft, facts });
              }}
            />

            <label htmlFor={`context-${fact.factId}`}>Contexte</label>
            <input
              id={`context-${fact.factId}`}
              value={fact.context}
              onChange={(event) => {
                const facts = [...draft.facts];
                facts[index] = { ...fact, context: event.target.value };
                setDraft({ ...draft, facts });
              }}
            />

            <label htmlFor={`fact-confidence-${fact.factId}`}>Confiance du fait</label>
            <select
              id={`fact-confidence-${fact.factId}`}
              value={fact.confidence}
              onChange={(event) => {
                const facts = [...draft.facts];
                facts[index] = { ...fact, confidence: event.target.value as Confidence };
                setDraft({ ...draft, facts });
              }}
            >
              <option value="low">faible</option>
              <option value="medium">moyenne</option>
              <option value="high">élevée</option>
            </select>

            <p className="muted">Zone relevée : {fact.sourceRegion}</p>
          </fieldset>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const ok = await send("correctAnnotation", {
              transcription: draft.transcription.trim() === "" ? null : draft.transcription,
              confidence: draft.confidence === "" ? null : draft.confidence,
              structuredFacts: draft.facts
            });

            if (ok) {
              setEditing(false);
              setSaved(true);
              // On recharge la version persistée plutôt que d'afficher l'état
              // local : ce que montre l'écran doit être ce qui est sur disque.
              router.refresh();
            }
          }}
        >
          Enregistrer
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            // Annuler n'écrit rien : on revient à la version affichée.
            setDraft(initialState(annotation));
            setEditing(false);
            setError(null);
          }}
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="review-actions">
      {error ? (
        <p className="muted" role="alert">
          {error}
        </p>
      ) : null}

      {saved ? (
        <p className="muted" role="status">
          Correction enregistrée. L&apos;annotation reste à relire : approuvez-la explicitement si elle
          correspond à l&apos;image.
        </p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setDraft(initialState(annotation));
          setEditing(true);
        }}
      >
        Corriger
      </button>

      <button type="button" disabled={busy} onClick={() => void send("approveAnnotation").then((ok) => ok && (nextHref ? router.push(nextHref) : router.refresh()))}>
        Approuver la source
      </button>

      <label htmlFor={`reason-${annotation.annotationId}`}>Motif du rejet</label>
      <textarea
        id={`reason-${annotation.annotationId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        placeholder="Ce qui ne correspond pas à l'image (10 caractères minimum)"
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 10}
        onClick={() =>
          void send("rejectAnnotation", { reason }).then(
            (ok) => ok && (nextHref ? router.push(nextHref) : router.refresh())
          )
        }
      >
        Rejeter
      </button>
    </div>
  );
}
