/**
 * Normalisation textuelle partagée par les contrôles de doublon et
 * d'atomicité. Volontairement locale et sans dépendance : détecter deux cartes
 * identiques ne justifie pas d'embarquer une base vectorielle.
 */

export function normalizeForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  const normalized = normalizeForComparison(value);
  return normalized.length === 0 ? [] : normalized.split(" ");
}

/**
 * Similarité de Jaccard sur les mots. Simple, explicable et suffisante pour
 * repérer deux formulations quasi identiques ; elle ne prétend pas comprendre
 * le sens, et les contrôles qui l'utilisent le signalent comme avertissement,
 * jamais comme erreur bloquante.
 */
export function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 && rightTokens.size === 0) {
    return 1;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Mots trop courts ou trop communs pour signaler une fuite de réponse. */
export const STOPWORDS = new Set([
  "le", "la", "les", "un", "une", "des", "du", "de", "d", "l", "et", "ou", "est", "sont",
  "au", "aux", "en", "dans", "sur", "par", "pour", "que", "qui", "quoi", "quel", "quelle",
  "ce", "cette", "ces", "son", "sa", "ses", "il", "elle", "on", "se", "ne", "pas", "plus",
  "a", "à", "avec", "sans", "leur", "leurs", "comme", "tout", "tous", "toute", "toutes"
]);

export function contentWords(value: string, minLength = 4): string[] {
  return tokenize(value).filter((token) => token.length >= minLength && !STOPWORDS.has(token));
}

/**
 * Part des mots significatifs du verso déjà présents au recto. Comparaison
 * orientée verso → recto : un verso long qui reprend la question est normal,
 * l'inverse ne l'est pas.
 */
export function answerLeakRatio(front: string, back: string): number {
  const backWords = contentWords(back);

  if (backWords.length === 0) {
    return 0;
  }

  const frontWords = new Set(contentWords(front));
  const leaked = backWords.filter((word) => frontWords.has(word));
  return leaked.length / backWords.length;
}

/**
 * Le vrai signal de fuite : le verso n'apporte **aucun** terme que le recto ne
 * contenait déjà. Le seul ratio ne suffisait pas — « Quel compte reçoit les
 * intérêts courus ? » / « Le compte 16883 » partage la plupart de ses mots avec
 * sa question tout en apportant la seule chose qui compte, le numéro de compte.
 *
 * Les nombres sont traités comme des termes à part entière : c'est souvent eux
 * qui portent la réponse en comptabilité.
 */
export function answerAddsNothingNew(front: string, back: string): boolean {
  const backTokens = tokenize(back).filter((token) => token.length >= 2 && !STOPWORDS.has(token));

  if (backTokens.length === 0) {
    return false;
  }

  const frontTokens = new Set(tokenize(front));
  return backTokens.every((token) => frontTokens.has(token));
}
