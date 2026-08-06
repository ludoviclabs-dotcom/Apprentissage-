"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/api-client";
import { Feedback } from "@/components/ui/feedback";

/**
 * Actions de publication.
 *
 * LE BOUTON N'EST PAS LA SÉCURITÉ. Il est masqué quand le contenu n'est pas
 * approuvé, quand les contrôles échouent ou quand la génération est en mode
 * mock — mais `/api/admin/content-publication` refuse de toute façon, et rejoue
 * les contrôles au moment exact de la publication. Ce qui est masqué ici est une
 * aide à la lecture ; ce qui protège est le serveur.
 *
 * LA CONFIRMATION EST UNE ÉTAPE, PAS UNE POLITESSE. « Publier » lance d'abord une
 * prévisualisation serveur, affiche ce qui sera publié et où, puis attend un
 * second geste. La route exige `confirmed: true` : un client qui sauterait
 * l'étape se voit refuser.
 */

interface PublicationIssue {
  code: string;
  message: string;
  path?: string;
}

interface PublicationReport {
  passed: boolean;
  errors: PublicationIssue[];
  warnings: PublicationIssue[];
  sourceIntegrity: {
    intact: boolean;
    corpusAvailable: boolean;
    referenceCount: number;
    documentCount: number;
  };
  deterministicValidation: {
    passed: boolean;
    checks: Array<{ label: string; passed: boolean; detail: string }>;
  };
  contentHash: string;
  publicationVersion: number;
}

interface PreviewResponse {
  report: PublicationReport;
  target: {
    artifactType: string;
    chapter: string;
    chapterLabel: string;
    slug: string;
    publicUrl: string;
    publicationVersion: number;
    sourceCount: number;
  };
  currentActive: { id: string; publicationVersion: number; publishedAt: string } | null;
  draft: { title: string; contentType: string; status: string; mode: string };
}

interface PublishResponse {
  versionId: string;
  publicationVersion: number;
  contentHash: string;
  publicUrl: string;
  archivedVersionId: string | null;
  auditRecorded: boolean;
  auditWarning?: string;
}

const TYPE_LABELS: Record<string, string> = {
  smart_revision_sheet: "Fiche de révision",
  flashcard: "Flashcard",
  calculation_exercise: "Exercice de calcul",
  journal_entry_exercise: "Écriture comptable",
  error_diagnosis_exercise: "Diagnostic d'erreur",
  progressive_case: "Mini-cas progressif"
};

export function PublicationActions({
  draftId,
  status,
  mode,
  activeVersionId,
  activePublicationVersion
}: {
  draftId: string;
  status: string;
  mode: "mock" | "live";
  /** Version publiée actuellement active pour cette identité logique, s'il y en a une. */
  activeVersionId: string | null;
  activePublicationVersion: number | null;
}) {
  const router = useRouter();
  const dialogId = useId();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error" | "partial"; text: string } | null>(
    null
  );

  const disabled = busy || pending;
  const publishable = status === "approved" && mode !== "mock";

  async function loadPreview(): Promise<void> {
    if (disabled) {
      return;
    }

    setBusy(true);
    setMessage(null);

    const result = await postJson<PreviewResponse>("/api/admin/content-publication", {
      action: "preview",
      draftId
    });

    setBusy(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }

    setPreview(result.data);
  }

  async function confirmPublish(): Promise<void> {
    if (disabled || !preview) {
      return;
    }

    setBusy(true);
    setMessage(null);

    const result = await postJson<PublishResponse>("/api/admin/content-publication", {
      action: "publish",
      draftId,
      confirmed: true,
      ...(comment.trim().length > 0 ? { comment: comment.trim() } : {})
    });

    setBusy(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }

    setPreview(null);
    setComment("");
    setMessage({
      tone: result.data.auditWarning ? "partial" : "success",
      text:
        result.data.auditWarning ??
        `Version ${result.data.publicationVersion} publiée${
          result.data.archivedVersionId ? " ; la version précédente est archivée" : ""
        }.`
    });

    startTransition(() => router.refresh());
  }

  async function archive(): Promise<void> {
    if (disabled || !activeVersionId) {
      return;
    }

    setBusy(true);
    setMessage(null);

    const result = await postJson<{ auditWarning?: string }>("/api/admin/content-publication", {
      action: "archive",
      versionId: activeVersionId,
      confirmed: true,
      ...(comment.trim().length > 0 ? { comment: comment.trim() } : {})
    });

    setBusy(false);

    if (!result.ok) {
      setMessage({ tone: "error", text: result.error });
      return;
    }

    setComment("");
    setMessage({
      tone: result.data.auditWarning ? "partial" : "success",
      text: result.data.auditWarning ?? "Version archivée : ce contenu n'est plus servi publiquement."
    });

    startTransition(() => router.refresh());
  }

  if (status !== "approved") {
    return (
      <p className="muted">
        Seul un contenu approuvé peut être publié. Ce contenu est en «&nbsp;{status}&nbsp;».
      </p>
    );
  }

  return (
    <div className="review-actions">
      {mode === "mock" ? (
        <Feedback tone="partial">
          Ce contenu vient d&apos;une fixture de démonstration (mode mock). Il ne peut pas être publié :
          régénérez-le en mode live avant de le proposer au site public.
        </Feedback>
      ) : null}

      <div className="review-actions-row">
        <button
          type="button"
          className="primary-action"
          disabled={disabled || !publishable}
          onClick={loadPreview}
        >
          {activeVersionId ? "Publier une nouvelle version" : "Publier"}
        </button>

        {activeVersionId ? (
          <>
            <a className="secondary-action" href={`/modules/comptabilite-approfondie`}>
              Prévisualiser la version publique
            </a>
            <button type="button" className="secondary-action" disabled={disabled} onClick={archive}>
              Archiver
            </button>
          </>
        ) : null}
      </div>

      {activeVersionId ? (
        <p className="muted">
          Version active&nbsp;: {activePublicationVersion ?? "—"} ({activeVersionId}).
        </p>
      ) : (
        <p className="muted">Ce contenu n&apos;a jamais été publié.</p>
      )}

      <div className="review-reject">
        <label htmlFor={`publication-comment-${draftId}`}>Commentaire (facultatif)</label>
        <textarea
          id={`publication-comment-${draftId}`}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Pourquoi cette publication, ou ce retrait."
        />
      </div>

      {preview ? (
        <section className="publication-confirm" role="dialog" aria-labelledby={dialogId} aria-modal="false">
          <h3 id={dialogId}>Confirmer la publication</h3>

          <dl className="publication-summary">
            <div>
              <dt>Titre</dt>
              <dd>{preview.draft.title}</dd>
            </div>
            <div>
              <dt>Type</dt>
              <dd>{TYPE_LABELS[preview.target.artifactType] ?? preview.target.artifactType}</dd>
            </div>
            <div>
              <dt>Chapitre</dt>
              <dd>{preview.target.chapterLabel}</dd>
            </div>
            <div>
              <dt>Version</dt>
              <dd>
                {preview.target.publicationVersion}
                {preview.currentActive
                  ? ` (remplace la version ${preview.currentActive.publicationVersion})`
                  : " (première publication)"}
              </dd>
            </div>
            <div>
              <dt>Sources citées</dt>
              <dd>
                {preview.target.sourceCount} référence(s) sur{" "}
                {preview.report.sourceIntegrity.documentCount} document(s)
              </dd>
            </div>
            <div>
              <dt>URL publique</dt>
              <dd>
                <code>{preview.target.publicUrl}</code>
              </dd>
            </div>
          </dl>

          {preview.report.deterministicValidation.checks.length > 0 ? (
            <>
              <h4>Contrôles rejoués</h4>
              <ul className="review-issues">
                {preview.report.deterministicValidation.checks.map((check) => (
                  <li key={check.label}>
                    {check.passed ? "✓" : "✗"} <strong>{check.label}</strong> — {check.detail}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {preview.report.warnings.length > 0 ? (
            <>
              <h4>Avertissements</h4>
              <ul className="review-issues">
                {preview.report.warnings.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    <strong>{issue.code}</strong> — {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {preview.report.errors.length > 0 ? (
            <>
              <h4>Erreurs bloquantes</h4>
              <ul className="review-issues">
                {preview.report.errors.map((issue, index) => (
                  <li key={`${issue.code}-${index}`}>
                    <strong>{issue.code}</strong> — {issue.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p>
            La publication crée un <strong>instantané immuable</strong> : une modification ultérieure de
            ce brouillon ne changera rien à ce que le site public affiche. Il faudra publier une nouvelle
            version.
          </p>

          <div className="review-actions-row">
            <button
              type="button"
              className="primary-action"
              disabled={disabled || !preview.report.passed}
              onClick={confirmPublish}
              title={
                preview.report.passed ? undefined : "Les contrôles de publication doivent passer."
              }
            >
              Publier maintenant
            </button>
            <button
              type="button"
              className="secondary-action"
              disabled={disabled}
              onClick={() => setPreview(null)}
            >
              Annuler
            </button>
          </div>
        </section>
      ) : null}

      {message ? <Feedback tone={message.tone}>{message.text}</Feedback> : null}
    </div>
  );
}
