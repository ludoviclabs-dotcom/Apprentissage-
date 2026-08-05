import type { DocumentCategory } from "./types";

/**
 * Classification documentaire déterministe, sans IA : tout se décide sur le nom
 * de fichier normalisé (accents retirés, minuscules). Les mêmes fonctions
 * produisent la catégorie, le chapitre probable et la clé de variante qui sert
 * au rapprochement exercice ↔ corrigé.
 */

export function normalizeForMatching(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

export function slugify(value: string): string {
  return normalizeForMatching(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const CORRECTION_PATTERN = /\b(corriges?|corrections?|solutions?)\b/;
const EXAM_PATTERN = /\b(examens?|partiels?|annales?|devoir surveille|sujet d examen)\b/;
const SYNTHESIS_PATTERN = /\bsyntheses?\b/;
const COURSE_PATTERN = /\bfiches? de cours\b|\bcours\b|\bfiches?\b/;
const EXERCISE_PATTERN =
  /\bmises? en situation\b|\bapplications?\b|\bexercices?\b|\betudiants?\b|\benonces?\b|\btd\b|\btp\b|\bcas pratiques?\b/;

/**
 * L'ordre est significatif : « Application 3 - Corrigé » est un corrigé, pas un
 * exercice ; « Synthèse » prime sur « cours » si les deux mots cohabitent.
 */
export function classifyDocumentCategory(fileName: string): DocumentCategory {
  const normalized = normalizeForMatching(stripExtension(fileName));

  if (CORRECTION_PATTERN.test(normalized)) return "correction";
  if (EXAM_PATTERN.test(normalized)) return "exam";
  if (SYNTHESIS_PATTERN.test(normalized)) return "synthesis";
  if (EXERCISE_PATTERN.test(normalized)) return "exercise";
  if (COURSE_PATTERN.test(normalized)) return "course";
  return "reference";
}

/** Segments de nom qui décrivent la nature du document, pas son chapitre. */
const CATEGORY_SEGMENT_PATTERN = new RegExp(
  [
    "^fiches? de cours$",
    "^cours$",
    "^fiches?$",
    "^mises? en situation$",
    "^applications?( complementaires?| \\d+)?$",
    "^exercices?( complementaires?| \\d+)?$",
    "^cas pratiques?( \\d+)?$",
    "^corrig[e]?s?$",
    "^corrections?$",
    "^solutions?$",
    "^syntheses?$",
    "^etudiants?$",
    "^enonces?$",
    "^examens?( blancs?)?$",
    "^partiels?$",
    "^annales?( \\d+)?$",
    "^sujets?( d examen)?$",
    "^devoir surveille( \\d+)?$",
    "^td( \\d+)?$",
    "^tp( \\d+)?$"
  ].join("|")
);

function splitNameSegments(baseName: string): string[] {
  return baseName
    .split(/\s+[-–—]\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export interface ChapterDetection {
  chapterLabel: string;
  chapterSlug: string;
}

/**
 * « Les titres - Fiche de cours.pdf » → chapitre « Les titres ». Les segments
 * de catégorie sont retirés ; s'il ne reste rien (nom entièrement descriptif),
 * le nom complet sans extension fait office de chapitre.
 */
export function detectChapter(fileName: string): ChapterDetection {
  const baseName = stripExtension(fileName);
  const segments = splitNameSegments(baseName);
  const chapterSegments = segments.filter(
    (segment) => !CATEGORY_SEGMENT_PATTERN.test(normalizeForMatching(segment))
  );

  const chapterLabel = (chapterSegments.length > 0 ? chapterSegments : [baseName]).join(" - ");
  return { chapterLabel, chapterSlug: slugify(chapterLabel) || slugify(baseName) };
}

/**
 * Clé de variante à l'intérieur d'un chapitre : « La méthode ABC - Application 3
 * - Corrigé » et « La méthode ABC - Application 3 » partagent `application-3`,
 * ce qui suffit à rapprocher l'énoncé de son corrigé sans IA. Les marqueurs de
 * correction sont exclus de la clé.
 */
export function variantKey(fileName: string): string {
  const baseName = stripExtension(fileName);
  const segments = splitNameSegments(baseName);
  const variantSegments = segments.filter((segment) => {
    const normalized = normalizeForMatching(segment);
    if (!CATEGORY_SEGMENT_PATTERN.test(normalized)) return false;
    if (CORRECTION_PATTERN.test(normalized)) return false;
    if (/^etudiants?$/.test(normalized)) return false;
    return true;
  });

  return variantSegments.map((segment) => slugify(segment)).join("-");
}
