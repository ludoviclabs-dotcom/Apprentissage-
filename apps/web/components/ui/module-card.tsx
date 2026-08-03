import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Carte d'un module structuré : titre, promesse, marqueur premium éventuel et
 * une seule action d'entrée. La bordure supérieure accentuée la distingue des
 * panneaux d'information.
 */
export function ModuleCard({
  href,
  title,
  description,
  premium = false,
  meta
}: {
  href: string;
  title: string;
  description: ReactNode;
  /** Affiché seulement quand la facturation est active : sinon rien n'est verrouillé. */
  premium?: boolean;
  meta?: ReactNode;
}) {
  return (
    <article className="panel module-card module-card--track">
      <div className="panel-heading">
        <div>
          <span className="section-label">Module</span>
          <h2>{title}</h2>
        </div>
        {premium ? <span className="state-token processing">Premium</span> : null}
      </div>
      <p>{description}</p>
      {meta}
      <Link className="primary-action inline-link" href={href}>
        Ouvrir le module
      </Link>
    </article>
  );
}
