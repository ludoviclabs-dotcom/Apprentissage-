import Link from "next/link";
import type { ReactNode } from "react";
import { GraduationCap } from "lucide-react";
import { PUBLIC_DEMO_TITLE } from "@/lib/features";
import type { RuntimeFlags } from "@/lib/runtime-flags";
import { MobileNav } from "@/components/shell/mobile-nav";
import { PublicDemoNotice } from "@/components/public-demo-notice";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { Topbar } from "@/components/shell/topbar";

/**
 * Shell authentifié (ou installation privée sans comptes) : navigation
 * pédagogique complète, indicateurs personnels, menu de compte et espace
 * Administration selon les droits. La démonstration publique n'entre jamais
 * ici — elle passe par `PublicShell`.
 */
export function AppShell({
  children,
  runtime,
  user,
  canManageSources,
  dueReviews
}: {
  children: ReactNode;
  runtime: RuntimeFlags;
  user: { id: string; email: string } | null;
  canManageSources: boolean;
  dueReviews: number | null;
}) {
  // Démo publique forcée avec un compte connecté : le shell reste l'AppShell
  // (progression personnelle), mais le branding et le statut disent la vérité.
  const statusLabel = runtime.publicDemo
    ? PUBLIC_DEMO_TITLE
    : runtime.databaseActive
      ? "Base privée active"
      : "Données locales seedées";
  const tagline = runtime.publicDemo ? "Démonstration publique" : "Local-first privé";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>

      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="Finance Learning Hub — Accueil">
          <span className="brand-mark">
            <GraduationCap size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>Finance Learning Hub</strong>
            <small>{tagline}</small>
          </span>
        </Link>

        <SidebarNav
          variant="app"
          canManageSources={canManageSources}
          dueReviews={dueReviews}
          idPrefix="sidebar"
        />
      </aside>

      <div className="workspace">
        <MobileNav
          variant="app"
          brandTagline={tagline}
          canManageSources={canManageSources}
          dueReviews={dueReviews}
          authEnabled={runtime.features.auth.enabled}
          userEmail={user?.email ?? null}
        />
        <Topbar
          variant="app"
          statusLabel={statusLabel}
          authEnabled={runtime.features.auth.enabled}
          userEmail={user?.email ?? null}
        />
        {runtime.publicDemo ? <PublicDemoNotice /> : null}
        <main id="contenu" className="content">
          {children}
        </main>
      </div>
    </div>
  );
}
