import { createHash } from "node:crypto";

/**
 * Empreinte canonique d'un contenu.
 *
 * `JSON.stringify` seul ne convient pas : deux objets égaux mais construits dans
 * un ordre de clés différent produiraient deux empreintes, et le contrôle
 * « le hash correspond-il au contenu revu ? » lèverait une fausse alerte à
 * chaque relecture. Les clés sont donc triées récursivement avant sérialisation.
 *
 * Les tableaux ne sont **pas** triés : l'ordre des lignes d'une écriture ou des
 * étapes d'un cas fait partie du contenu, et le réordonner reviendrait à dire
 * que deux écritures différentes sont la même.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const sorted: Record<string, unknown> = {};

  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];

    // `undefined` disparaît de la sérialisation JSON : le laisser rendrait
    // l'empreinte dépendante de la présence d'une clé sans valeur.
    if (child !== undefined) {
      sorted[key] = canonicalize(child);
    }
  }

  return sorted;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}
