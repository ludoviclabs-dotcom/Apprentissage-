"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ContentDraftStatus, ValidationMetadata } from "@finance/content-generation";
import { postJson } from "@/lib/api-client";
import { Feedback } from "@/components/ui/feedback";

/**
 * Actions de revue.
 *
 * Le serveur décide seul : ce composant n'envoie jamais un statut, seulement une
 * intention. Les boutons reflètent l'état connu, mais leur absence n'est pas une
 * sécurité — la route refuse de toute façon une transition interdite.
 */

interface ActionResponse {
  status: ContentDraftStatus;
  passed?: boolean;
  validation?: ValidationMetadata;
}

export function ReviewActions({
  draftId,
  status,
  canApprove
}: {
  draftId: string;
  status: ContentDraftStatus;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [reason, setReason] = useState("");

  async function run(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    // Un second envoi pendant qu'une action est en vol produirait deux
    // transitions pour une seule intention.
    if (busy || pending) {
      return;
    }

    setBusy(true);
    setMessage(null);

    const result = await postJson<ActionResponse>("/api/admin/content-review", {
      action,
      draftId,
      ...extra
    });

    setBusy(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }

    setMessage({
      tone: result.data.passed === false ? "info" : "success",
      text:
        action === "validateDraft"
          ? result.data.passed
            ? "Contrôles passés : le contenu peut être approuvé."
            : "Contrôles en échec : le contenu ne peut pas être approuvé en l'état."
          : `Statut : ${result.data.status}.`
    });

    startTransition(() => router.refresh());
  }

  const disabled = busy || pending;

  return (
    <div className="review-actions">
      <div className="review-actions-row">
        <button type="button" className="secondary-action" disabled={disabled} onClick={() => run("validateDraft")}>
          Relancer la validation
        </button>

        {status === "needs_review" ? (
          <button
            type="button"
            className="primary-action"
            disabled={disabled || !canApprove}
            onClick={() => run("approveDraft")}
            title={canApprove ? undefined : "Les contrôles déterministes doivent passer avant approbation."}
          >
            Approuver
          </button>
        ) : null}

        {(status === "validation_failed" || status === "rejected") ? (
          <button type="button" className="secondary-action" disabled={disabled} onClick={() => run("reopenDraft")}>
            Remettre en brouillon
          </button>
        ) : null}
      </div>

      {status === "needs_review" ? (
        <div className="review-reject">
          <label htmlFor={`reject-${draftId}`}>Motif de rejet</label>
          <textarea
            id={`reject-${draftId}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            minLength={10}
            maxLength={2000}
            placeholder="Pourquoi ce contenu ne convient pas (10 caractères minimum)."
          />
          <button
            type="button"
            className="secondary-action"
            disabled={disabled || reason.trim().length < 10}
            onClick={() => run("rejectDraft", { reason: reason.trim() })}
          >
            Rejeter
          </button>
        </div>
      ) : null}

      {status === "approved" ? (
        <p className="muted">
          Contenu approuvé. L&apos;approbation ne publie rien : la publication est une action distincte,
          déclenchée explicitement plus bas.
        </p>
      ) : null}

      {message ? (
        <Feedback tone={message.tone === "info" ? "partial" : message.tone}>{message.text}</Feedback>
      ) : null}
    </div>
  );
}
