import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/**
 * État vide honnête : ce qui manque, pourquoi, et l'action qui le remplit.
 * Pas un panneau générique de plus — la vignette centre le message.
 */
export function EmptyState({
  title,
  description,
  action,
  icon
}: {
  title: string;
  description?: ReactNode;
  /** L'action qui sort de l'état vide (lien ou bouton). */
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <section className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon ?? <Inbox size={22} />}
      </span>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </section>
  );
}
