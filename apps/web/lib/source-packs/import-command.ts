/**
 * Construction, côté navigateur, de la commande d'analyse d'un corpus.
 *
 * Cette page n'importe rien : l'analyse se fait dans le terminal du projet, sur
 * la machine où vivent les documents. Le serveur web n'a pas — et ne doit pas
 * avoir — accès au système de fichiers de l'utilisateur, et une instance
 * déployée n'y aurait de toute façon aucun accès.
 *
 * Le chemin saisi ici ne sert donc qu'à composer une chaîne de caractères
 * affichée à l'écran. Il n'est jamais envoyé, jamais lu, jamais exécuté. Ces
 * fonctions sont pures et sans effet de bord, ce qui les rend testables et ce
 * qui garantit qu'aucune exécution ne peut s'y glisser.
 */

/** La commande réellement définie dans le package.json de la racine. */
export const SCAN_SCRIPT = "content:scan";

/** Les étapes qui suivent le scan, dans l'ordre où elles doivent être lancées. */
export const PIPELINE_STEPS = [
  { script: "content:scan", purpose: "inventorie les documents et calcule leurs empreintes" },
  { script: "content:extract", purpose: "extrait le texte page par page" },
  { script: "content:pair", purpose: "rapproche cours, exercices et corrigés par chapitre" },
  { script: "content:validate", purpose: "contrôle la cohérence et signale ce qui est à revoir" }
] as const;

export type PathRejection =
  | "empty"
  | "absolute-windows"
  | "absolute-posix"
  | "unc"
  | "url-scheme"
  | "traversal"
  | "control-char"
  | "quote";

export interface PathCheck {
  ok: boolean;
  reason?: PathRejection;
  /** Message destiné à l'utilisateur, jamais un code brut à l'écran. */
  message?: string;
  /** Chemin normalisé (séparateurs `/`, sans `./` initial ni `/` final). */
  normalized?: string;
}

/**
 * Un exemple relatif, jamais absolu : le placeholder est du code de
 * l'application, et un exemple avec lettre de lecteur y révélerait une
 * arborescence de poste — ce que le garde-fou `no-absolute-paths` interdit.
 */
export const PATH_PLACEHOLDER = "source-packs/mon-pack";

const EMPTY_MESSAGE = `Indiquez le dossier à analyser, par exemple ${PATH_PLACEHOLDER}.`;

/** Le conseil est le même quelle que soit la forme absolue rencontrée. */
const RELATIVE_HINT = `Utilisez un chemin relatif au projet, par exemple ${PATH_PLACEHOLDER}.`;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }

  return false;
}

export function validateRelativeSourcePath(raw: string): PathCheck {
  const value = raw.trim();

  if (value === "") {
    return { ok: false, reason: "empty", message: EMPTY_MESSAGE };
  }

  // Caractères de contrôle : invisibles à l'écran, ils rendraient la commande
  // affichée différente de la commande copiée.
  if (hasControlCharacter(value)) {
    return {
      ok: false,
      reason: "control-char",
      message: "Ce chemin contient des caractères invisibles. Retapez-le sans les copier depuis une autre source."
    };
  }

  // Guillemets et backticks : ils casseraient l'échappement de la commande.
  if (/["'`]/.test(value)) {
    return {
      ok: false,
      reason: "quote",
      message: "N'utilisez ni guillemets ni accents graves dans le chemin."
    };
  }

  if (value.startsWith("\\\\")) {
    return {
      ok: false,
      reason: "unc",
      message: `Les chemins réseau ne sont pas acceptés. ${RELATIVE_HINT}`
    };
  }

  if (/^[a-zA-Z]:[\\/]/.test(value)) {
    return {
      ok: false,
      reason: "absolute-windows",
      message: RELATIVE_HINT
    };
  }

  if (/^\//.test(value)) {
    return {
      ok: false,
      reason: "absolute-posix",
      message: RELATIVE_HINT
    };
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    return {
      ok: false,
      reason: "url-scheme",
      message: `Une URL n'est pas un chemin de dossier. ${RELATIVE_HINT}`
    };
  }

  const segments = value.replace(/\\/g, "/").split("/");

  if (segments.some((segment) => segment === "..")) {
    return {
      ok: false,
      reason: "traversal",
      message: `Le chemin doit rester dans le projet : retirez les « .. », par exemple ${PATH_PLACEHOLDER}.`
    };
  }

  const normalized = segments
    .filter((segment, index) => segment !== "" && !(index === 0 && segment === "."))
    .join("/");

  if (normalized === "") {
    return { ok: false, reason: "empty", message: EMPTY_MESSAGE };
  }

  return { ok: true, normalized };
}

/**
 * Compose la commande à copier. Renvoie `undefined` plutôt que de composer une
 * commande à partir d'un chemin refusé : il n'existe aucun chemin par lequel
 * une saisie invalide devienne une commande affichable.
 */
export function buildScanCommand(rawPath: string): string | undefined {
  const check = validateRelativeSourcePath(rawPath);

  if (!check.ok || !check.normalized) {
    return undefined;
  }

  return `pnpm ${SCAN_SCRIPT} --root "${check.normalized}"`;
}
