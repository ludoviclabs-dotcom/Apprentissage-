"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  ClipboardCheck,
  FileText,
  FolderArchive,
  GraduationCap,
  LayoutDashboard,
  MessageSquare
} from "lucide-react";

const navigation = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/source-packs", label: "Source packs", icon: FolderArchive },
  { href: "/apprendre", label: "Apprendre", icon: BookOpen },
  { href: "/exercices", label: "Exercices", icon: ClipboardCheck },
  { href: "/corrections", label: "Corrections", icon: MessageSquare },
  { href: "/simulations", label: "Simulations", icon: BriefcaseBusiness }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

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
            Données locales seedées
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
