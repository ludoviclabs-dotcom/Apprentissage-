/**
 * Le contrat d'indisponibilité, côté public.
 *
 * Une capacité désactivée doit s'expliquer. Jusqu'ici elle s'expliquait avec la
 * phrase qu'un opérateur aurait voulu lire — « active FINANCE_HUB_USE_DATABASE
 * et DATABASE_URL » — et cette phrase partait telle quelle dans le HTML public,
 * sous chaque carte de révision. Deux lecteurs, deux besoins, une seule chaîne :
 * c'est le défaut que ce module supprime.
 *
 * Ce fichier ne porte QUE le message destiné au visiteur. Le diagnostic
 * d'exploitation vit dans `availability-diagnostics.ts`, qui importe
 * `server-only` : un Client Component qui tenterait de le lire casse la
 * compilation au lieu de le sérialiser dans le payload.
 *
 * Règle de rédaction d'un `publicMessage` : il décrit ce que le visiteur peut ou
 * ne peut pas faire, jamais la configuration qui en décide. Aucun nom de
 * variable, aucun nom de service, aucun chemin de fichier. Le test
 * `availability.test.ts` refuse le contraire.
 */

export type AvailabilityReasonCode =
  | "public-demo"
  | "account-required"
  | "persistence-unavailable"
  | "billing-disabled"
  | "planned"
  /**
   * Sixième code, hors de la liste initiale et assumé : un tuteur IA non
   * configuré n'est ni « prévu » ni « en démo ». Le ranger sous `planned`
   * promettrait une fonctionnalité à venir là où il s'agit d'un choix
   * d'installation — l'inverse de l'honnêteté que ces messages doivent avoir.
   */
  | "ai-disabled"
  /**
   * Septième code, même raisonnement : un espace d'administration volontairement
   * fermé n'est ni « prévu », ni indisponible faute de base. Il est éteint.
   */
  | "feature-disabled";

/** Une porte de sortie réelle, jamais un bouton mort. */
export interface AvailabilityAction {
  label: string;
  href: string;
}

/**
 * L'état d'une capacité tel qu'il peut traverser la frontière serveur/client.
 *
 * Il n'y a volontairement pas de champ `adminDiagnostic` ici. Un champ « à ne
 * pas rendre » finit rendu ; un champ absent du type ne peut pas fuiter.
 */
export interface AvailabilityState {
  enabled: boolean;
  /** Présents seulement quand `enabled` est faux. */
  code?: AvailabilityReasonCode;
  /** Écrit pour le visiteur, en français, sans détail d'exploitation. */
  publicMessage?: string;
  optionalAction?: AvailabilityAction;
}

export const AVAILABLE: AvailabilityState = { enabled: true };

export function unavailable(
  code: AvailabilityReasonCode,
  publicMessage: string,
  optionalAction?: AvailabilityAction
): AvailabilityState {
  return optionalAction
    ? { enabled: false, code, publicMessage, optionalAction }
    : { enabled: false, code, publicMessage };
}

/**
 * Les identifiants internes interdits dans tout octet destiné au navigateur.
 *
 * Exporté parce que trois vérifications indépendantes s'en servent : le test
 * unitaire du contrat, le test de rendu des pages publiques, et la spec
 * Playwright qui relit la réponse HTTP réelle. Une seule liste, sinon l'une des
 * trois finit par diverger et la protection devient décorative.
 */
export const INTERNAL_CONFIG_PATTERN =
  /DATABASE_URL|DATABASE_ADMIN_URL|FINANCE_HUB_|LEARNING_HUB_|STRIPE_|OPENAI_API_KEY/;

export function containsInternalConfigNames(text: string): boolean {
  return INTERNAL_CONFIG_PATTERN.test(text);
}
