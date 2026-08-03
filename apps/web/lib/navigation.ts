/**
 * Architecture d'information de la navigation.
 *
 * Une seule source de vérité, pure et sérialisable : la sidebar, le drawer
 * mobile et les tests lisent la même structure. Cinq destinations principales
 * au maximum ; les outils secondaires (recherche, administration, compte)
 * vivent dans la topbar ou dans des espaces dédiés, jamais dans cette liste.
 */

export type NavSectionKey = "apprendre" | "entrainer" | "reviser" | "progression";

export interface NavLeaf {
  href: string;
  label: string;
  /**
   * Un lien d'ancre pointe vers une section d'une page existante. Il ne
   * revendique jamais l'état actif : c'est le lien de la page porteuse qui le
   * porte, sinon deux entrées seraient `aria-current` en même temps.
   */
  anchor?: boolean;
}

export interface NavSection {
  key: NavSectionKey;
  label: string;
  items: readonly NavLeaf[];
}

export const HOME_NAV_ITEM: NavLeaf = { href: "/", label: "Accueil" };

export const PRIMARY_NAV_SECTIONS: readonly NavSection[] = [
  {
    key: "apprendre",
    label: "Apprendre",
    items: [
      { href: "/apprendre", label: "Leçon du jour" },
      { href: "/parcours", label: "Parcours" },
      { href: "/cours", label: "Cours" },
      { href: "/modules", label: "Modules" },
      { href: "/connaissances", label: "Connaissances" }
    ]
  },
  {
    key: "entrainer",
    label: "S'entraîner",
    items: [
      { href: "/exercices", label: "Exercices" },
      { href: "/annales-concours", label: "Annales & concours" },
      { href: "/business-cases", label: "Business cases" },
      { href: "/simulations", label: "Simulations" }
    ]
  },
  {
    key: "reviser",
    label: "Réviser",
    items: [
      { href: "/revisions", label: "Session du jour" },
      { href: "/revisions#carnet-erreurs", label: "Carnet d'erreurs", anchor: true },
      { href: "/corrections", label: "Corrections" }
    ]
  },
  {
    key: "progression",
    label: "Progression",
    items: [
      { href: "/progression", label: "Compétences" },
      { href: "/progression#badges", label: "Badges", anchor: true },
      { href: "/attestations", label: "Attestations" }
    ]
  }
];

/**
 * Espace Administration documentaire. Rendu uniquement quand le visiteur peut
 * gérer le corpus (voir `resolveViewerRole`) ; les routes restent accessibles
 * en accès direct pour ne masquer aucune fonctionnalité.
 */
export const ADMIN_NAV_SECTION = {
  label: "Administration",
  items: [
    { href: "/documents", label: "Documents" },
    { href: "/source-packs", label: "Source packs" }
  ]
} as const;

/**
 * L'état actif d'un lien, compatible avec les routes imbriquées :
 * `/modules/excel-finance-lab/exercices/xyz` active l'entrée `/modules`.
 * La racine ne matche qu'exactement, sinon elle serait active partout.
 */
export function isPathActive(pathname: string, href: string): boolean {
  if (href.includes("#")) {
    return false;
  }

  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSectionActive(pathname: string, section: NavSection): boolean {
  return section.items.some((item) => isPathActive(pathname, item.href));
}

/**
 * Valeur `aria-current` d'un lien : `page` pour la route exacte, `true` pour
 * un ancêtre d'une route imbriquée, absent sinon.
 */
export function ariaCurrentFor(pathname: string, href: string): "page" | "true" | undefined {
  if (!isPathActive(pathname, href)) {
    return undefined;
  }

  return pathname === href ? "page" : "true";
}
