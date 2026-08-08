"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContentDraftStatus, ValidationMetadata } from "@finance/content-generation";
import { postJson } from "@/lib/api-client";
import { Feedback } from "@/components/ui/feedback";

/**
 * Décision de revue.
 *
 * LE SERVEUR DÉCIDE SEUL. Ce composant n'envoie jamais un statut, seulement une
 * intention ; la route refuse toute transition interdite, et l'absence d'un
 * bouton n'est donc pas une sécurité. Ce qui est traité ici est autre chose :
 * qu'un relecteur sache **quelle action fait avancer le contenu**, et ce
 * qu'elle engage.
 *
 * L'APPROBATION EST IRRÉVERSIBLE DEPUIS L'INTERFACE, et c'est ce qui justifie
 * la confirmation. Une fois approuvé : modifier renvoie 409, rouvrir renvoie
 * 409, rejeter est refusé — la seule sortie est une régénération. Un bouton
 * unique, cliqué par réflexe entre deux lectures, engageait donc une décision
 * qu'on ne peut pas reprendre. La boîte rappelle ce qui est approuvé et ce que
 * l'approbation fige ; elle ne demande pas de recopier une phrase, ce qui
 * n'aurait fait qu'ajouter une friction sans ajouter une vérification.
 *
 * LA BARRE COLLANTE PARTAGE CET ÉTAT, ELLE NE LE DUPLIQUE PAS. La page de
 * détail est longue — sources, aperçu, contrôles, historique — et la décision
 * se prend en bas. Deux composants qui appelleraient chacun la route auraient
 * fini par diverger sur ce qu'ils envoient ; ici les deux rendus partagent les
 * mêmes gestionnaires.
 */

interface ActionResponse {
  status: ContentDraftStatus;
  passed?: boolean;
  validation?: ValidationMetadata;
}

/** Ce que la boîte de confirmation rappelle, avant de figer la révision. */
export interface ApprovalSummary {
  title: string;
  typeLabel: string;
  chapterLabel: string;
  normativeProfileLabel: string;
  scoringPolicyLabel: string;
  sourceCount: number;
  validationPassed: boolean;
  qualityScore: number | null;
  warnings: string[];
}

const MIN_REASON = 10;

export function ReviewActions({
  draftId,
  status,
  canApprove,
  summary,
  nextDraftId
}: {
  draftId: string;
  status: ContentDraftStatus;
  canApprove: boolean;
  summary: ApprovalSummary;
  /** Prochain contenu à relire, selon l'ordre de risque. `null` s'il n'y en a plus. */
  nextDraftId: string | null;
}) {
  const router = useRouter();
  const dialogId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error" | "info"; text: string } | null>(null);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [decided, setDecided] = useState(false);

  // Le premier bouton de la boîte reçoit le focus : au clavier, la confirmation
  // ne doit pas obliger à retraverser la page pour l'atteindre.
  useEffect(() => {
    if (confirming) {
      confirmRef.current?.focus();
    }
  }, [confirming]);

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

    if (action === "approveDraft" || action === "rejectDraft") {
      setDecided(true);
    }

    setMessage({
      tone: result.data.passed === false ? "info" : "success",
      text:
        action === "validateDraft"
          ? result.data.passed
            ? "Contrôles passés : le contenu peut être approuvé."
            : "Contrôles en échec : le contenu ne peut pas être approuvé en l'état."
          : action === "approveDraft"
            ? "Contenu approuvé. Cette révision est figée ; l'approbation ne publie rien."
            : action === "rejectDraft"
              ? "Contenu rejeté. Il peut être rouvert, corrigé, puis remis en revue."
              : `Statut : ${result.data.status}.`
    });

    startTransition(() => router.refresh());
  }

  const disabled = busy || pending;
  const reasonLength = reason.trim().length;
  const canReject = reasonLength >= MIN_REASON;
  const inReview = status === "needs_review";

  const approveButton = (extraClass = "") => (
    <button
      type="button"
      className={`primary-action ${extraClass}`.trim()}
      disabled={disabled || !canApprove}
      onClick={() => setConfirming(true)}
      title={canApprove ? undefined : "Les contrôles déterministes doivent passer avant approbation."}
    >
      Approuver le contenu
    </button>
  );

  return (
    <div className="review-actions">
      {inReview ? (
        <>
          <div className="review-decision">
            <div className="review-actions-row">
              {approveButton("review-decision-primary")}

              <button
                type="button"
                className="secondary-action"
                disabled={disabled}
                onClick={() => run("validateDraft")}
              >
                Relancer la validation
              </button>
            </div>

            <p className="review-decision-note">
              L&apos;approbation <strong>fige cette révision</strong>. Une modification ultérieure
              nécessitera une nouvelle génération ou une nouvelle révision : depuis cette interface, un
              contenu approuvé ne peut plus être modifié, rouvert ni rejeté.
            </p>
          </div>

          <div className="review-reject">
            <label htmlFor={`reject-${draftId}`}>Motif du rejet</label>
            <p className="review-reject-help" id={`reject-help-${draftId}`}>
              Minimum {MIN_REASON} caractères. Le contenu rejeté pourra être rouvert puis corrigé.
            </p>
            <textarea
              id={`reject-${draftId}`}
              aria-describedby={`reject-help-${draftId} reject-count-${draftId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Pourquoi ce contenu ne convient pas."
            />
            <p className="review-reject-count" id={`reject-count-${draftId}`}>
              {reasonLength} / {MIN_REASON} caractères minimum
            </p>
            <button
              type="button"
              className="secondary-action"
              disabled={disabled || !canReject}
              onClick={() => run("rejectDraft", { reason: reason.trim() })}
            >
              Rejeter le contenu
            </button>
          </div>
        </>
      ) : null}

      {status === "validation_failed" || status === "rejected" ? (
        <div className="review-actions-row">
          <button type="button" className="secondary-action" disabled={disabled} onClick={() => run("validateDraft")}>
            Relancer la validation
          </button>
          <button type="button" className="secondary-action" disabled={disabled} onClick={() => run("reopenDraft")}>
            Rouvrir en brouillon
          </button>
        </div>
      ) : null}

      {status === "approved" ? (
        <p className="muted">
          Contenu approuvé, révision figée. L&apos;approbation ne publie rien : la publication est une
          action distincte, déclenchée explicitement plus bas.
        </p>
      ) : null}

      {message ? (
        <Feedback tone={message.tone === "info" ? "partial" : message.tone}>{message.text}</Feedback>
      ) : null}

      {decided ? (
        <p className="review-next">
          {nextDraftId ? (
            <Link className="secondary-action" href={`/admin/content-review/${nextDraftId}`}>
              Élément suivant à relire
            </Link>
          ) : (
            <Link className="secondary-action" href="/admin/content-review">
              Revenir à la file de relecture
            </Link>
          )}
        </p>
      ) : null}

      {confirming ? (
        <div className="review-confirm-backdrop" role="presentation" onClick={() => setConfirming(false)}>
          <section
            className="review-confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogId}
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id={dialogId}>Confirmer l&apos;approbation</h3>

            <dl className="publication-summary">
              <div>
                <dt>Titre</dt>
                <dd>{summary.title}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{summary.typeLabel}</dd>
              </div>
              <div>
                <dt>Chapitre</dt>
                <dd>{summary.chapterLabel}</dd>
              </div>
              <div>
                <dt>Profil normatif</dt>
                <dd>{summary.normativeProfileLabel}</dd>
              </div>
              <div>
                <dt>Politique de notation</dt>
                <dd>{summary.scoringPolicyLabel}</dd>
              </div>
              <div>
                <dt>Sources citées</dt>
                <dd>{summary.sourceCount}</dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>
                  {summary.validationPassed ? "Tous les contrôles passent" : "Contrôles en échec"}
                  {summary.qualityScore === null ? "" : ` · qualité ${summary.qualityScore}/100`}
                </dd>
              </div>
            </dl>

            {summary.warnings.length > 0 ? (
              <>
                <h4>Avertissements</h4>
                <ul className="review-issues">
                  {summary.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>{warning}</li>
                  ))}
                </ul>
              </>
            ) : null}

            <p>
              Vous confirmez avoir vérifié le contenu, ses sources et son traitement comptable. Cette
              révision sera figée après approbation.
            </p>

            <div className="review-actions-row">
              <button
                type="button"
                className="secondary-action"
                disabled={disabled}
                onClick={() => setConfirming(false)}
              >
                Annuler
              </button>
              <button
                ref={confirmRef}
                type="button"
                className="primary-action"
                disabled={disabled}
                onClick={() => {
                  setConfirming(false);
                  void run("approveDraft");
                }}
              >
                Confirmer l&apos;approbation
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <ReviewStickyBar
        status={status}
        disabled={disabled}
        canApprove={canApprove}
        canReject={canReject}
        onApprove={() => setConfirming(true)}
        onReject={() => run("rejectDraft", { reason: reason.trim() })}
        onReopen={() => run("reopenDraft")}
        rejectHref={`#reject-${draftId}`}
      />
    </div>
  );
}

const STATUS_LABELS: Record<ContentDraftStatus, string> = {
  draft: "Brouillon",
  validation_failed: "Contrôles en échec",
  needs_review: "À relire",
  approved: "Approuvé",
  rejected: "Rejeté"
};

/**
 * La barre d'actions, toujours atteignable.
 *
 * Elle ne porte que ce que le statut autorise, et rien qui ne soit déjà dans la
 * page : c'est un raccourci vers la décision, pas une seconde façon de la
 * prendre. Sur un contenu approuvé elle renvoie vers la publication au lieu de
 * l'offrir — la publication a ses propres contrôles, et les dupliquer ici aurait
 * recréé exactement la confusion qu'on corrige.
 */
function ReviewStickyBar({
  status,
  disabled,
  canApprove,
  canReject,
  onApprove,
  onReject,
  onReopen,
  rejectHref
}: {
  status: ContentDraftStatus;
  disabled: boolean;
  canApprove: boolean;
  canReject: boolean;
  onApprove: () => void;
  onReject: () => void;
  onReopen: () => void;
  rejectHref: string;
}) {
  return (
    <div className="review-sticky-bar">
      <span className="review-sticky-status">
        Statut&nbsp;: <strong>{STATUS_LABELS[status]}</strong>
      </span>

      <div className="review-sticky-actions">
        {status === "needs_review" ? (
          <>
            {canReject ? (
              <button type="button" className="secondary-action" disabled={disabled} onClick={onReject}>
                Rejeter
              </button>
            ) : (
              <a className="secondary-action" href={rejectHref}>
                Rejeter…
              </a>
            )}
            <button
              type="button"
              className="primary-action"
              disabled={disabled || !canApprove}
              onClick={onApprove}
            >
              Approuver
            </button>
          </>
        ) : null}

        {status === "approved" ? (
          <a className="secondary-action" href="#publication">
            Publication
          </a>
        ) : null}

        {status === "rejected" || status === "validation_failed" ? (
          <button type="button" className="secondary-action" disabled={disabled} onClick={onReopen}>
            Rouvrir
          </button>
        ) : null}
      </div>
    </div>
  );
}
