import {
  documentCategories,
  pairingReportSchema,
  type ChapterGroup,
  type ContentIssue,
  type ContentManifest,
  type ContentManifestEntry,
  type DocumentCategory,
  type PairingReport
} from "./types";

/**
 * Rapprochement déterministe des documents par chapitre, sans IA : la clé de
 * groupe est (domaine, chapitre), la clé de rapprochement exercice ↔ corrigé
 * est la variante (« application-3 », « mise-en-situation », …). Un groupe à
 * un seul énoncé et un seul corrigé est apparié même sans clé commune.
 */
export function pairManifest(manifest: ContentManifest, now?: () => Date): PairingReport {
  const groupsByKey = new Map<string, ContentManifestEntry[]>();

  for (const entry of manifest.files) {
    const key = `${entry.domainId}::${entry.chapterSlug}`;
    const bucket = groupsByKey.get(key) ?? [];
    bucket.push(entry);
    groupsByKey.set(key, bucket);
  }

  const groups: ChapterGroup[] = [];
  let pairCount = 0;
  let exercisesWithoutCorrection = 0;
  let correctionsWithoutExercise = 0;

  for (const key of [...groupsByKey.keys()].sort()) {
    const entries = groupsByKey.get(key) ?? [];
    const [domainId] = key.split("::");
    const chapterLabel = entries[0]?.chapterLabel ?? key;
    const chapterSlug = entries[0]?.chapterSlug ?? key;

    const documents = {} as Record<DocumentCategory, string[]>;
    for (const category of documentCategories) {
      documents[category] = entries
        .filter((entry) => entry.category === category)
        .map((entry) => entry.relativePath)
        .sort();
    }

    const exercises = entries.filter((entry) => entry.category === "exercise");
    const corrections = entries.filter((entry) => entry.category === "correction");
    const pairs: ChapterGroup["pairs"] = [];
    const matchedCorrections = new Set<string>();
    const matchedExercises = new Set<string>();

    for (const exercise of exercises) {
      const match = corrections.find(
        (correction) =>
          !matchedCorrections.has(correction.relativePath) &&
          correction.variantKey === exercise.variantKey
      );

      if (match) {
        pairs.push({ exercise: exercise.relativePath, correction: match.relativePath, variantKey: exercise.variantKey });
        matchedCorrections.add(match.relativePath);
        matchedExercises.add(exercise.relativePath);
      }
    }

    // Cas fréquent : un seul énoncé et un seul corrigé dans le chapitre — le
    // rapprochement est sans ambiguïté même si les noms ne se répondent pas.
    if (pairs.length === 0 && exercises.length === 1 && corrections.length === 1) {
      pairs.push({
        exercise: exercises[0].relativePath,
        correction: corrections[0].relativePath,
        variantKey: exercises[0].variantKey || corrections[0].variantKey
      });
      matchedExercises.add(exercises[0].relativePath);
      matchedCorrections.add(corrections[0].relativePath);
    }

    const issues: ContentIssue[] = [];

    for (const exercise of exercises) {
      if (!matchedExercises.has(exercise.relativePath)) {
        exercisesWithoutCorrection += 1;
        issues.push({
          code: "exercice-sans-corrige",
          message: `aucun corrigé rapproché pour ${exercise.relativePath}`
        });
      }
    }

    for (const correction of corrections) {
      if (!matchedCorrections.has(correction.relativePath)) {
        correctionsWithoutExercise += 1;
        issues.push({
          code: "corrige-sans-exercice",
          message: `aucun énoncé rapproché pour ${correction.relativePath} (le corrigé contient peut-être l'énoncé)`
        });
      }
    }

    if (documents.course.length === 0 && documents.synthesis.length === 0) {
      issues.push({
        code: "chapitre-sans-cours",
        message: `aucune fiche de cours ni synthèse pour le chapitre « ${chapterLabel} »`
      });
    }

    pairCount += pairs.length;
    groups.push({ chapterSlug, chapterLabel, domainId, documents, pairs, issues });
  }

  return pairingReportSchema.parse({
    packId: manifest.packId,
    generatedAt: (now?.() ?? new Date()).toISOString(),
    groups,
    counts: {
      groups: groups.length,
      pairs: pairCount,
      exercisesWithoutCorrection,
      correctionsWithoutExercise
    }
  });
}
