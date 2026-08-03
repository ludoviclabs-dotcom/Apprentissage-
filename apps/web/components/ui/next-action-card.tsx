import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Le CTA dominant de l'accueil : une seule prochaine action, son contexte et
 * sa durée. C'est la carte la plus visible de la page — accent plein, flèche,
 * hover d'un pixel, rien de plus.
 */
export function NextActionCard({
  href,
  label,
  title,
  meta
}: {
  href: string;
  /** Rubrique courte au-dessus du titre, ex. « Continuer » ou « Découvrir ». */
  label: string;
  title: string;
  /** Contexte : durée estimée, module, jour du parcours. */
  meta?: string;
}) {
  return (
    <Link href={href} className="next-action-card">
      <span className="next-action-card-body">
        <span className="next-action-card-label">{label}</span>
        <strong>{title}</strong>
        {meta ? <small>{meta}</small> : null}
      </span>
      <ArrowRight size={20} aria-hidden="true" className="next-action-card-arrow" />
    </Link>
  );
}
