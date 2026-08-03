import type { ReactNode } from "react";

export type StatTone = "neutral" | "accent" | "success" | "warning" | "danger";

/**
 * Chiffre-clé compact. Le ton colore une fine bordure latérale, jamais le
 * fond entier : les stats se lisent, elles ne crient pas.
 */
export function StatCard({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: StatTone;
}) {
  return (
    <article className={`stat-card stat-card--${tone}`}>
      <span className="stat-card-label">{label}</span>
      <strong className="stat-card-value">{value}</strong>
      {detail ? <p className="stat-card-detail">{detail}</p> : null}
    </article>
  );
}
