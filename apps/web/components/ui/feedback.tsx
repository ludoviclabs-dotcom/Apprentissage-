"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, MinusCircle } from "lucide-react";

export type FeedbackTone = "success" | "partial" | "error" | "info" | "pending";

const TONE_ICON: Record<FeedbackTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  partial: MinusCircle,
  error: AlertTriangle,
  info: Info,
  pending: LoaderCircle
};

const TONE_PREFIX: Record<FeedbackTone, string> = {
  success: "Succès",
  partial: "Réponse partielle",
  error: "Erreur",
  info: "Information",
  pending: "En cours"
};

/**
 * Bloc de feedback des actions pédagogiques.
 *
 * - `role="alert"` pour les erreurs (annonce immédiate), `role="status"` sinon ;
 * - l'état n'est jamais porté par la couleur seule : icône + préfixe textuel ;
 * - l'apparition est animée (`feedback-appear`) parce qu'elle suit une action
 *   réelle de l'utilisateur — jamais un simple rendu de page.
 */
export function Feedback({
  tone,
  children,
  prefix
}: {
  tone: FeedbackTone;
  children: ReactNode;
  /** Remplace le préfixe par défaut quand la phrase le rend redondant. */
  prefix?: string | null;
}) {
  const Icon = TONE_ICON[tone];
  const label = prefix === undefined ? TONE_PREFIX[tone] : prefix;

  return (
    <div
      className={`feedback feedback--${tone} feedback-appear`}
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon
        size={16}
        aria-hidden="true"
        className={tone === "pending" ? "feedback-icon search-pending-icon" : "feedback-icon"}
      />
      <div className="feedback-body">
        {label ? <strong>{label}</strong> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
