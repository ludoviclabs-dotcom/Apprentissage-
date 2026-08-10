"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Les décisions humaines, et rien d'autre.
 *
 * Aucune action par défaut : aucun bouton n'est présélectionné, et il n'existe
 * pas d'action de lot. Le rejet exige un motif, comme dans la relecture de
 * contenu — un rejet sans motif est inexploitable pour qui reprend le travail.
 */
export function AnnotationActions({
  annotationId,
  reviewStatus,
  nextHref
}: {
  annotationId: string;
  reviewStatus: string;
  nextHref: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setError(null);

    const response = await fetch("/api/admin/source-annotations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, annotationId, ...extra })
    });

    setBusy(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { details?: string; error?: string };
      setError(payload.details ?? payload.error ?? "Action impossible");
      return;
    }

    // Après une décision, on enchaîne sur la suivante à relire : c'est le
    // déroulement d'une file, pas d'un formulaire isolé.
    if (nextHref) {
      router.push(nextHref);
    } else {
      router.refresh();
    }
  }

  if (reviewStatus === "approved") {
    return (
      <p className="muted">
        Annotation signée. Une correction passe par une nouvelle révision, jamais par une réécriture.
      </p>
    );
  }

  return (
    <div className="review-actions">
      {error ? (
        <p className="muted" role="alert">
          {error}
        </p>
      ) : null}

      <button type="button" disabled={busy} onClick={() => void send("approveAnnotation")}>
        Approuver la source
      </button>

      <label htmlFor={`reason-${annotationId}`}>Motif du rejet</label>
      <textarea
        id={`reason-${annotationId}`}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={3}
        placeholder="Ce qui ne correspond pas à l'image (10 caractères minimum)"
      />
      <button
        type="button"
        disabled={busy || reason.trim().length < 10}
        onClick={() => void send("rejectAnnotation", { reason })}
      >
        Rejeter
      </button>
    </div>
  );
}
