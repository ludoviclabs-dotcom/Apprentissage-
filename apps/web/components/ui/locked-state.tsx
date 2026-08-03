import type { ReactNode } from "react";
import { Lock } from "lucide-react";

/**
 * État verrouillé : dit ce qui est fermé, la condition d'ouverture, et ne
 * ressemble ni à une erreur ni à un vide. Le cadenas est décoratif — la
 * condition est toujours écrite.
 */
export function LockedState({
  title,
  condition,
  action
}: {
  title: string;
  /** La condition d'ouverture, toujours en toutes lettres. */
  condition: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="locked-state">
      <span className="locked-state-icon" aria-hidden="true">
        <Lock size={16} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{condition}</p>
        {action}
      </div>
    </div>
  );
}
