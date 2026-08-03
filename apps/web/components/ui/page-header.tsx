import type { ReactNode } from "react";

/**
 * Entête de page standard.
 *
 * Une page = un PageHeader : rubrique, titre, description, et une zone
 * d'action ou de statut à droite. La variante `hero` porte la bande d'accent
 * qui distingue l'entête du flot de panneaux qui suit.
 */
export function PageHeader({
  label,
  title,
  description,
  aside,
  children,
  variant = "hero"
}: {
  label: string;
  title: string;
  description?: ReactNode;
  /** Action principale ou statut, aligné à droite. */
  aside?: ReactNode;
  /** Contenu additionnel sous la description (ex. CTA dominant). */
  children?: ReactNode;
  variant?: "hero" | "plain";
}) {
  return (
    <section className={variant === "hero" ? "page-header page-header--hero" : "page-header"}>
      <div>
        <span className="section-label">{label}</span>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {aside}
    </section>
  );
}
