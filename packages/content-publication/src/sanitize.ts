/**
 * Retrait du texte des sources avant publication.
 *
 * LE PIÈGE ÉTAIT DANS LE CONTENU, PAS DANS LES RÉFÉRENCES DE TÊTE.
 * `collectPublishedReferences` nettoie bien la liste agrégée
 * (`sourceReferencesSnapshot`), mais le contenu lui-même porte ses propres
 * `sourceReferences` — sur chaque règle, chaque formule, chaque étape de frise,
 * chaque question de rappel actif. Recopier la charge utile telle quelle
 * emportait donc les `excerpt` et `excerptHash` de ces références imbriquées
 * dans les fichiers commités, dans la base, et jusque dans la charge utile RSC
 * envoyée au navigateur pour rendre la fiche.
 *
 * Autrement dit : le texte des PDF privés franchissait la frontière par
 * l'endroit qu'on ne regardait pas. Ce module est la réponse, et il est
 * appliqué **avant le calcul de l'empreinte**, pour que l'instantané publié et
 * son hash décrivent la même chose.
 *
 * `excerpt` et `excerptHash` sont optionnels dans `sourceReferenceSchema` : les
 * retirer laisse une référence parfaitement valide.
 */

/** Ce qu'une référence de source ne doit jamais emporter en publication. */
export const STRIPPED_REFERENCE_FIELDS = ["excerpt", "excerptHash"] as const;

/**
 * Copie profonde d'une valeur, débarrassée du texte des sources.
 *
 * Le retrait n'est pas restreint aux tableaux nommés `sourceReferences` : il
 * s'applique à toute clé `excerpt`/`excerptHash`, où qu'elle se trouve. Un
 * schéma futur qui logerait une référence sous un autre nom serait couvert sans
 * qu'on ait à y penser — et aucun des six schémas actuels n'emploie ces noms
 * ailleurs, donc rien de légitime n'est perdu.
 */
export function stripSourceExcerpts<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(walk);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  const cleaned: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((STRIPPED_REFERENCE_FIELDS as readonly string[]).includes(key)) {
      continue;
    }

    cleaned[key] = walk(child);
  }

  return cleaned;
}

/**
 * Reste-t-il du texte de source quelque part ?
 *
 * Sert de contrôle après nettoyage plutôt que de remplacement : une assertion
 * qui échoue est plus utile qu'un nettoyage dont personne ne vérifie l'effet.
 */
export function findRemainingExcerptPaths(value: unknown, path = ""): string[] {
  const found: string[] = [];

  function scan(current: unknown, at: string): void {
    if (Array.isArray(current)) {
      current.forEach((item, index) => scan(item, `${at}[${index}]`));
      return;
    }

    if (current === null || typeof current !== "object") {
      return;
    }

    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      if ((STRIPPED_REFERENCE_FIELDS as readonly string[]).includes(key)) {
        found.push(at ? `${at}.${key}` : key);
        continue;
      }

      scan(child, at ? `${at}.${key}` : key);
    }
  }

  scan(value, path);

  return found;
}
