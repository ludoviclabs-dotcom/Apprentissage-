/**
 * The one comparison key used everywhere answers are matched against expected
 * text: business-case scoring, the short-text rubric, journal account codes.
 *
 * There must be exactly one of these. Two near-identical normalisers is how
 * "produits à recevoir" ends up credited by one scorer and rejected by another —
 * the accent bug PR-00 fixed was precisely a mismatch between two sides of one
 * comparison.
 *
 * Collapsing runs of whitespace is part of the key: a learner who types two
 * spaces has not made a mistake.
 */
export function normalizeForMatching(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
