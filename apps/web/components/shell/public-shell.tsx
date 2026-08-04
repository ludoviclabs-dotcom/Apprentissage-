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
 * Shell public : démonstration en lecture seule ou visiteur non connecté.
 *
 * Il présente le produit et donne accès à la démonstration, sans espace
 * d'administration, sans indicateurs personnels et sans branding
 * « Local-first privé » — rien ici ne doit prétendre appartenir au visiteur.
 */
export function PublicShell({
  children,
  runtime
}: {
  children: ReactNode;
  runtime: RuntimeFlags;
}) {
  const authEnabled = runtime.features.auth.enabled;
  const tagline = runtime.publicDemo ? "Démonstration publique" : "Apprendre la finance";
  const statusLabel = runtime.publicDemo ? PUBLIC_DEMO_TITLE : "Espace de découverte";

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

        <SidebarNav variant="public" idPrefix="sidebar" />

        {authEnabled ? (
          <div className="sidebar-auth">
            <Link href="/login" className="secondary-action inline-link">
              Se connecter
            </Link>
            <Link href="/signup" className="primary-action inline-link">
              Créer un compte
            </Link>
          </div>
        ) : null}
      </aside>

      <div className="workspace">
        <MobileNav
          variant="public"
          brandTagline={tagline}
          authEnabled={authEnabled}
          userEmail={null}
        />
        <Topbar variant="public" statusLabel={statusLabel} authEnabled={authEnabled} userEmail={null} />

        {runtime.publicDemo ? <PublicDemoNotice /> : null}

        <main id="contenu" className="content">
          {children}
        </main>
      </div>
    </div>
  );
}
