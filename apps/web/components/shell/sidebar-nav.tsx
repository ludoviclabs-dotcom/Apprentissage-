"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  ClipboardCheck,
  FileCheck,
  FolderOpen,
  GraduationCap,
  Home,
  LineChart,
  PackageOpen,
  Repeat
} from "lucide-react";
import {
  ADMIN_NAV_SECTION,
  HOME_NAV_ITEM,
  PRIMARY_NAV_SECTIONS,
  ariaCurrentFor,
  isNavItemActive,
  isSectionActive,
  type NavSectionKey
} from "@/lib/navigation";

const SECTION_ICONS: Record<NavSectionKey, typeof GraduationCap> = {
  apprendre: GraduationCap,
  entrainer: ClipboardCheck,
  reviser: Repeat,
  progression: LineChart
};

const ADMIN_ITEM_ICONS = [FolderOpen, PackageOpen, FileCheck];

/**
 * Navigation groupée : cinq destinations principales, sous-sections pliables.
 *
 * Une section repliée le reste jusqu'à un clic ou une navigation vers l'une de
 * ses pages — la section active se déplie d'elle-même pour que l'état courant
 * ne soit jamais caché.
 */
export function SidebarNav({
  variant,
  canManageSources = false,
  dueReviews = null,
  idPrefix,
  onNavigate
}: {
  /** `public` : pas d'administration, pas d'indicateurs personnels. */
  variant: "app" | "public";
  canManageSources?: boolean;
  dueReviews?: number | null;
  /** Distingue les ids d'accessibilité entre sidebar et drawer mobile. */
  idPrefix: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  /**
   * Dépliées par défaut (refonte du chrome).
   *
   * La règle d'origine ouvrait la seule section porteuse de la route : cinq
   * cibles à l'arrivée, le reste à un clic. La refonte montre l'arborescence
   * entière, ce qui rend visible d'un coup ce que le produit sait faire.
   *
   * Le repli n'est PAS supprimé pour autant : les entêtes restent des boutons
   * `aria-expanded`, et un écran court peut refermer ce qui ne sert pas. C'est
   * la différence entre « tout est montré » et « tout est imposé » — la
   * maquette dessine des libellés inertes, ce qui aurait retiré l'affordance
   * en même temps que le repli.
   */
  const [expanded, setExpanded] = useState<Record<NavSectionKey, boolean>>(() => {
    const initial = {} as Record<NavSectionKey, boolean>;

    for (const section of PRIMARY_NAV_SECTIONS) {
      initial[section.key] = true;
    }

    return initial;
  });

  useEffect(() => {
    setExpanded((current) => {
      const next = { ...current };

      for (const section of PRIMARY_NAV_SECTIONS) {
        if (isSectionActive(pathname, section)) {
          next[section.key] = true;
        }
      }

      return next;
    });
  }, [pathname]);

  const showAdmin = variant === "app" && canManageSources;
  const showDueBadge = variant === "app" && typeof dueReviews === "number" && dueReviews > 0;

  return (
    <nav className="nav-groups" aria-label="Navigation principale">
      <Link
        href={HOME_NAV_ITEM.href}
        className={isNavItemActive(pathname, HOME_NAV_ITEM.href) ? "nav-item active" : "nav-item"}
        aria-current={ariaCurrentFor(pathname, HOME_NAV_ITEM.href)}
        onClick={onNavigate}
      >
        <Home size={18} aria-hidden="true" />
        <span>{HOME_NAV_ITEM.label}</span>
      </Link>

      {PRIMARY_NAV_SECTIONS.map((section) => {
        const Icon = SECTION_ICONS[section.key];
        const isOpen = expanded[section.key];
        const panelId = `${idPrefix}-section-${section.key}`;
        const active = isSectionActive(pathname, section);

        return (
          <div key={section.key} className={active ? "nav-section active" : "nav-section"}>
            <button
              type="button"
              className="nav-section-toggle"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() =>
                setExpanded((current) => ({ ...current, [section.key]: !current[section.key] }))
              }
            >
              <Icon size={18} aria-hidden="true" />
              <span>{section.label}</span>
              {section.key === "reviser" && showDueBadge ? (
                <span className="nav-badge" aria-label={`${dueReviews} révisions dues`}>
                  {dueReviews}
                </span>
              ) : null}
              <ChevronDown size={16} aria-hidden="true" className="nav-chevron" />
            </button>
            <ul id={panelId} className="nav-sub" hidden={!isOpen}>
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={isNavItemActive(pathname, item.href) ? "nav-subitem active" : "nav-subitem"}
                    aria-current={ariaCurrentFor(pathname, item.href)}
                    onClick={onNavigate}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {showAdmin ? (
        <div className="nav-admin">
          <span className="nav-admin-label" id={`${idPrefix}-admin-label`}>
            {ADMIN_NAV_SECTION.label}
          </span>
          <ul className="nav-sub" aria-labelledby={`${idPrefix}-admin-label`}>
            {ADMIN_NAV_SECTION.items.map((item, index) => {
              const Icon = ADMIN_ITEM_ICONS[index] ?? FolderOpen;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={isNavItemActive(pathname, item.href) ? "nav-subitem active" : "nav-subitem"}
                    aria-current={ariaCurrentFor(pathname, item.href)}
                    onClick={onNavigate}
                  >
                    <Icon size={16} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
