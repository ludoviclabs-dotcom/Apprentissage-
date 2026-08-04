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
      // Une vraie route depuis PR-20 : le lien menait à une ancre, la page
      // atteinte s'appelait « Session du jour » et c'est elle qui restait active.
      { href: "/revisions/carnet-erreurs", label: "Carnet d'erreurs" },
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
 * Un lien *couvre* une route : correspondance exacte ou ancêtre de segment.
 * `/modules/excel-finance-lab/exercices/xyz` est couvert par `/modules`.
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

/** Toutes les destinations réelles du menu, ancres exclues. */
function allDestinations(): string[] {
  return [
    HOME_NAV_ITEM.href,
    ...PRIMARY_NAV_SECTIONS.flatMap((section) => section.items.map((item) => item.href)),
    ...ADMIN_NAV_SECTION.items.map((item) => item.href)
  ].filter((href) => !href.includes("#"));
}

/**
 * Le lien du menu qui revendique la route courante — le plus spécifique, un
 * seul.
 *
 * `isPathActive` seul ne suffit plus depuis que `/revisions/carnet-erreurs`
 * existe : il est couvert par `/revisions` *et* par lui-même, et les deux
 * entrées s'allumaient, avec deux `aria-current` simultanés. La règle « le plus
 * long href gagne » range le cas sans liste d'exceptions, et laisse
 * `/exercices/session-decouverte` — qui n'a pas d'entrée propre — allumer
 * « Exercices », ce qui est le comportement voulu.
 */
export function resolveActiveHref(pathname: string): string | undefined {
  return allDestinations()
    .filter((href) => isPathActive(pathname, href))
    .sort((left, right) => right.length - left.length)[0];
}

/** L'état actif d'une entrée de menu, en tenant compte de ses voisines. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return !href.includes("#") && resolveActiveHref(pathname) === href;
}

export function isSectionActive(pathname: string, section: NavSection): boolean {
  const active = resolveActiveHref(pathname);

  return active !== undefined && section.items.some((item) => item.href === active);
}

/**
 * Valeur `aria-current` d'un lien : `page` pour la route exacte, `true` pour
 * un ancêtre d'une route imbriquée, absent sinon.
 */
export function ariaCurrentFor(pathname: string, href: string): "page" | "true" | undefined {
  if (!isNavItemActive(pathname, href)) {
    return undefined;
  }

  return pathname === href ? "page" : "true";
}
