"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { RuntimeFlags } from "@/lib/runtime-flags";
import {
  BookOpen,
  BriefcaseBusiness,
  ClipboardCheck,
  GraduationCap,
  Home,
  Library,
  LineChart,
  NotebookTabs,
  Repeat,
  Route,
  Search
} from "lucide-react";

const navigation = [
  { href: "/", label: "Accueil", icon: Home },
  { href: "/parcours", label: "Parcours", icon: Route },
  { href: "/cours", label: "Cours", icon: BookOpen },
  { href: "/connaissances", label: "Connaissances", icon: Library },
  { href: "/recherche", label: "Recherche", icon: Search },
  { href: "/exercices", label: "Exercices", icon: ClipboardCheck },
  { href: "/annales-concours", label: "Annales & Concours", icon: NotebookTabs },
  { href: "/business-cases", label: "Business Cases", icon: BriefcaseBusiness },
  { href: "/revisions", label: "Revisions", icon: Repeat },
  { href: "/progression", label: "Progression", icon: LineChart }
];

export function AppShell({ children, runtime }: { children: ReactNode; runtime: RuntimeFlags }) {
  const pathname = usePathname();
  const statusLabel = runtime.publicDemo
    ? "Démo publique lecture seule"
    : runtime.databaseActive
      ? "Base privée active"
      : "Données locales seedées";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Navigation principale">
        <Link href="/" className="brand" aria-label="Finance Learning Hub">
          <span className="brand-mark">
            <GraduationCap size={20} aria-hidden="true" />
          </span>
          <span>
            <strong>Finance Learning Hub</strong>
            <small>Local-first privé</small>
          </span>
        </Link>

        <nav className="nav-list">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? "nav-item active" : "nav-item"}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>Parcours guidé</strong>
            <span>Socle commun, exercices, corrections et logique métier.</span>
          </div>
          <div className="topbar-status">
            <span className="status-dot" aria-hidden="true" />
            {statusLabel}
          </div>
        </header>
        {runtime.publicDemo ? (
          <section className="demo-banner" aria-label="Statut de la démonstration">
            <strong>Démo publique</strong>
            <span>
              Les imports et uploads sont bloqués en production publique. Ne dépose aucun document réel tant que
              l'authentification et la base privée ne sont pas activées.
            </span>
          </section>
        ) : null}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
