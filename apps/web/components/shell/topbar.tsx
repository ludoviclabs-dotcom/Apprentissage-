"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Search } from "lucide-react";
import { resolveTopbar } from "@/lib/topbar";
import { AccountMenu } from "@/components/shell/account-menu";

/**
 * Topbar contextuelle : rubrique, titre, breadcrumb et actions dépendent de la
 * route courante, résolus par la configuration centralisée de `lib/topbar.ts`.
 */
export function Topbar({
  variant,
  statusLabel,
  authEnabled,
  userEmail
}: {
  variant: "app" | "public";
  statusLabel: string;
  authEnabled: boolean;
  userEmail: string | null;
}) {
  const pathname = usePathname();
  const topbar = resolveTopbar(pathname);

  return (
    <header className="topbar">
      <div className="topbar-context">
        {topbar.breadcrumb.length > 1 ? (
          <nav aria-label="Fil d'Ariane" className="topbar-breadcrumb">
            <ol>
              {topbar.breadcrumb.map((entry, index) => (
                <Fragment key={`${entry.label}-${index}`}>
                  <li>
                    {entry.href ? <Link href={entry.href}>{entry.label}</Link> : <span>{entry.label}</span>}
                  </li>
                </Fragment>
              ))}
            </ol>
          </nav>
        ) : (
          <span className="topbar-section">{topbar.section}</span>
        )}
        <strong>{topbar.title}</strong>
        {topbar.subtitle ? <span className="topbar-subtitle">{topbar.subtitle}</span> : null}
      </div>

      {topbar.search ? (
        <form action="/recherche" method="get" className="topbar-search" role="search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            name="q"
            placeholder="Rechercher dans le hub..."
            aria-label="Recherche globale"
          />
        </form>
      ) : null}

      <div className="topbar-status">
        <span className="status-dot" aria-hidden="true" />
        <span>{statusLabel}</span>
      </div>

      {variant === "app" ? (
        <AccountMenu authEnabled={authEnabled} userEmail={userEmail} />
      ) : authEnabled ? (
        <div className="topbar-auth">
          <Link href="/login" className="secondary-action inline-link">
            Se connecter
          </Link>
          <Link href="/signup" className="primary-action inline-link">
            Créer un compte
          </Link>
        </div>
      ) : null}
    </header>
  );
}
