"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ValidationMetadata } from "@finance/content-generation";
import { postJson } from "@/lib/api-client";
import { Feedback } from "@/components/ui/feedback";

/**
 * Édition d'un brouillon.
 *
 * Le contenu est édité en JSON : c'est délibéré pour ce lot. Un formulaire par
 * type de contenu représenterait six formulaires à maintenir en parallèle des
 * schémas, alors que la correction attendue ici est ponctuelle — un compte, un
 * montant, une formulation. Le serveur revalide intégralement avant d'écrire,
 * donc une saisie fautive est refusée avec l'emplacement exact du problème.
 */
export function DraftEditor({
  draftId,
  initialContent,
  disabled
}: {
  draftId: string;
  initialContent: unknown;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => JSON.stringify(initialContent, null, 2));
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string; details?: string[] } | null>(
    null
  );

  async function save(): Promise<void> {
    if (busy || pending) {
      return;
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(value);
    } catch (error) {
      setMessage({
        tone: "error",
        text: `JSON invalide : ${error instanceof Error ? error.message : "syntaxe incorrecte"}`
      });
      return;
    }

    setBusy(true);
    setMessage(null);

    const result = await postJson<{ passed: boolean; validation?: ValidationMetadata }>(
      "/api/admin/content-review",
      { action: "saveDraft", draftId, content: parsed }
    );

    setBusy(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }

    setMessage({
      tone: result.data.passed ? "success" : "error",
      text: result.data.passed
        ? "Modification enregistrée : les contrôles passent."
        : "Modification enregistrée, mais les contrôles échouent toujours.",
      details: result.data.validation?.errors.map((issue) => `${issue.path ?? ""} ${issue.message}`.trim())
    });

    startTransition(() => router.refresh());
  }

  if (disabled) {
    return (
      <p className="muted">
        Ce contenu est approuvé : il n&apos;est plus modifiable. Régénérez-le pour produire une nouvelle révision.
      </p>
    );
  }

  return (
    <div className="draft-editor">
      <button type="button" className="secondary-action" onClick={() => setOpen((current) => !current)}>
        {open ? "Fermer l'édition" : "Modifier le contenu"}
      </button>

      {open ? (
        <>
          <label htmlFor={`editor-${draftId}`} className="sr-only">
            Contenu du brouillon au format JSON
          </label>
          <textarea
            id={`editor-${draftId}`}
            className="draft-editor-area"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            rows={20}
            spellCheck={false}
          />
          <button type="button" className="primary-action" disabled={busy || pending} onClick={save}>
            Enregistrer et revalider
          </button>
        </>
      ) : null}

      {message ? (
        <Feedback tone={message.tone}>
          {message.text}
          {message.details && message.details.length > 0 ? (
            <ul>
              {message.details.slice(0, 8).map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
        </Feedback>
      ) : null}
    </div>
  );
}
