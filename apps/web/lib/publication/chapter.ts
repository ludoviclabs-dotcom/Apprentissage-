import "server-only";
import {
  catalogueFromArtifactTypes,
  computeChapterProgress,
  COMPTA_APPROFONDIE,
  COMPTA_APPROFONDIE_MODULE,
  getPublicChapter,
  toPublicCalculationExercise,
  toPublicErrorDiagnosisExercise,
  toPublicFlashcardFront,
  toPublicJournalEntryExercise,
  toPublicProgressiveCase,
  toPublicSourceReferences,
  type ChapterActivityEvent,
  type ChapterProgress,
  type PublicCalculationExercise,
  type PublicChapterDefinition,
  type PublicErrorDiagnosisExercise,
  type PublicFlashcardFront,
  type PublicJournalEntryExercise,
  type PublicProgressiveCase,
  type PublicSourceReference
} from "@finance/content-publication";
import type { SmartRevisionSheet } from "@finance/content-generation";
import { getChapterActivity } from "@finance/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  listChapterEntries,
  loadChapterVersionsOfType,
  loadPublishedVersion,
  PublicationStoreUnavailableError,
  PublishedContentUnavailableError,
  type PublishedEntry
} from "@/lib/publication/store";

/**
 * Vue serveur d'un chapitre publié.
 *
 * ELLE NE CHARGE QUE CE QUE L'ONGLET DEMANDE. Un chapitre complet — fiche,
 * quinze cartes, six exercices, un mini-cas — est plus lourd que ce qu'une page
 * affiche à un instant donné ; charger l'ensemble pour rendre l'onglet
 * « Comprendre » ferait payer à chaque lecteur le coût de tout ce qu'il ne
 * regarde pas. L'index suffit à savoir ce que le chapitre propose ; les
 * instantanés ne sont ouverts que par type.
 */

export const COMPTA_APPROFONDIE_BASE = "/modules/comptabilite-approfondie";

export const CHAPTER_SECTIONS = ["comprendre", "fiche", "entrainer", "reviser", "sources"] as const;

export type ChapterSection = (typeof CHAPTER_SECTIONS)[number];

export const CHAPTER_SECTION_LABELS: Record<ChapterSection, string> = {
  comprendre: "Comprendre",
  fiche: "Fiche 2.0",
  entrainer: "S'entraîner",
  reviser: "Réviser",
  sources: "Sources"
};

/** Une section inconnue retombe sur « Comprendre » plutôt que sur un 404. */
export function parseSection(value: string | undefined): ChapterSection {
  return CHAPTER_SECTIONS.includes(value as ChapterSection) ? (value as ChapterSection) : "comprendre";
}

export function chapterUrl(chapterSlug: string, section?: ChapterSection): string {
  const base = `${COMPTA_APPROFONDIE_BASE}/${chapterSlug}`;

  return section && section !== "comprendre" ? `${base}?section=${section}` : base;
}

export interface ChapterOverview {
  definition: PublicChapterDefinition;
  /** Ce que le chapitre publie réellement, par type. */
  counts: Record<string, number>;
  totalActivities: number;
  published: boolean;
  /**
   * Vrai quand le magasin n'a pas pu être interrogé.
   *
   * Distinct de `published: false`. « Rien n'est publié » et « on n'a pas pu
   * savoir » sont deux faits différents, et un écran qui affiche le même état
   * vide pour les deux ment au lecteur — et masque une production mal
   * configurée derrière une page d'apparence normale.
   */
  unavailable: boolean;
  lastPublishedAt: string | null;
  estimatedMinutes: number;
}

/**
 * Une lecture de magasin qui ne fait pas tomber la page.
 *
 * L'indisponibilité est *rapportée*, jamais confondue avec le vide, et la cause
 * est journalisée côté serveur — sans chaîne de connexion, que ni le message
 * d'erreur ni la page ne portent.
 */
async function readEntries(
  chapterSlug: string
): Promise<{ entries: PublishedEntry[]; unavailable: boolean }> {
  try {
    return { entries: await listChapterEntries(COMPTA_APPROFONDIE_MODULE, chapterSlug), unavailable: false };
  } catch (error) {
    if (
      error instanceof PublicationStoreUnavailableError ||
      error instanceof PublishedContentUnavailableError
    ) {
      console.error("[publication-store] lecture impossible", { chapter: chapterSlug, name: error.name });
      return { entries: [], unavailable: true };
    }

    throw error;
  }
}

/**
 * Ce qu'un chapitre propose, sans ouvrir un seul instantané.
 *
 * L'index porte le type et la date de chaque version active : de quoi afficher
 * la carte du chapitre sur la page du module et décider quels onglets ont du
 * contenu.
 */
export async function loadChapterOverview(chapterSlug: string): Promise<ChapterOverview | null> {
  const definition = getPublicChapter(chapterSlug);

  if (!definition) {
    return null;
  }

  const { entries, unavailable } = await readEntries(chapterSlug);
  const counts: Record<string, number> = {};

  for (const entry of entries) {
    counts[entry.artifactType] = (counts[entry.artifactType] ?? 0) + 1;
  }

  // Une estimation de durée assemblée depuis ce qui est publié, jamais une
  // constante décorative : cinq minutes par carte ou exercice, quinze pour la
  // fiche, vingt pour un mini-cas. Le détail est discutable, l'invention ne
  // l'est pas — un chapitre vide annonce zéro.
  const estimatedMinutes =
    (counts.smart_revision_sheet ?? 0) * 15 +
    (counts.flashcard ?? 0) * 2 +
    (counts.calculation_exercise ?? 0) * 5 +
    (counts.journal_entry_exercise ?? 0) * 8 +
    (counts.error_diagnosis_exercise ?? 0) * 5 +
    (counts.progressive_case ?? 0) * 20;

  return {
    definition,
    counts,
    totalActivities: entries.length,
    published: entries.length > 0,
    unavailable,
    lastPublishedAt:
      entries.length === 0
        ? null
        : entries.reduce(
            (latest, entry) => (entry.publishedAt > latest ? entry.publishedAt : latest),
            entries[0].publishedAt
          ),
    estimatedMinutes
  };
}

export interface ModuleOverview {
  module: typeof COMPTA_APPROFONDIE;
  chapters: ChapterOverview[];
  availableChapters: ChapterOverview[];
  upcomingChapters: ChapterOverview[];
  totalActivities: number;
  /** Vrai dès qu'un chapitre n'a pas pu être interrogé. */
  unavailable: boolean;
}

export async function loadModuleOverview(): Promise<ModuleOverview> {
  const chapters: ChapterOverview[] = [];

  for (const definition of COMPTA_APPROFONDIE.chapters) {
    const overview = await loadChapterOverview(definition.slug);

    if (overview) {
      chapters.push(overview);
    }
  }

  return {
    module: COMPTA_APPROFONDIE,
    chapters,
    availableChapters: chapters.filter((chapter) => chapter.published),
    // Un chapitre dont le magasin est injoignable n'est pas « à venir » : on ne
    // sait pas ce qu'il contient. Le mettre dans la liste des chapitres à venir
    // affirmerait qu'il n'est pas publié, ce que rien n'établit.
    upcomingChapters: chapters.filter((chapter) => !chapter.published && !chapter.unavailable),
    totalActivities: chapters.reduce((sum, chapter) => sum + chapter.totalActivities, 0),
    unavailable: chapters.some((chapter) => chapter.unavailable)
  };
}

// --- Chargements par onglet ------------------------------------------------

/**
 * La fiche, réduite à ce qu'une page a le droit de recevoir.
 *
 * `PublishedContentVersion` porte `generationMetadataSnapshot` — fournisseur,
 * modèle, **identifiant et version de prompt**, empreinte des entrées — ainsi
 * que les notes de relecture et le détail de validation. Rien de tout cela ne
 * regarde un lecteur, et rien de tout cela n'est nécessaire pour afficher une
 * fiche. Le DTO les retire à la frontière plutôt que de compter sur le fait que
 * les composants n'y touchent pas : un composant serveur qui reçoit l'entité
 * complète est à un `props` près de la faire traverser vers le navigateur.
 */
export interface PublicSheetView {
  /** Identifiant de la version publiée, pour l'enregistrement d'activité. */
  artifactId: string;
  publicationVersion: number;
  sheet: SmartRevisionSheet;
  sources: PublicSourceReference[];
}

export async function loadChapterSheet(chapterSlug: string): Promise<PublicSheetView | null> {
  const versions = await loadChapterVersionsOfType(
    COMPTA_APPROFONDIE_MODULE,
    chapterSlug,
    "smart_revision_sheet"
  );
  const version = versions[0];

  if (!version || version.contentSnapshot.contentType !== "smart_revision_sheet") {
    return null;
  }

  return {
    artifactId: version.id,
    publicationVersion: version.publicationVersion,
    sheet: version.contentSnapshot.content,
    sources: toPublicSourceReferences(version.sourceReferencesSnapshot)
  };
}

export async function loadChapterFlashcards(chapterSlug: string): Promise<PublicFlashcardFront[]> {
  const versions = await loadChapterVersionsOfType(COMPTA_APPROFONDIE_MODULE, chapterSlug, "flashcard");

  return versions.map(toPublicFlashcardFront);
}

export interface ChapterTrainingSet {
  calculations: PublicCalculationExercise[];
  journalEntries: PublicJournalEntryExercise[];
  diagnoses: PublicErrorDiagnosisExercise[];
  cases: PublicProgressiveCase[];
}

export async function loadChapterTraining(chapterSlug: string): Promise<ChapterTrainingSet> {
  const [calculations, journalEntries, diagnoses, cases] = await Promise.all([
    loadChapterVersionsOfType(COMPTA_APPROFONDIE_MODULE, chapterSlug, "calculation_exercise"),
    loadChapterVersionsOfType(COMPTA_APPROFONDIE_MODULE, chapterSlug, "journal_entry_exercise"),
    loadChapterVersionsOfType(COMPTA_APPROFONDIE_MODULE, chapterSlug, "error_diagnosis_exercise"),
    loadChapterVersionsOfType(COMPTA_APPROFONDIE_MODULE, chapterSlug, "progressive_case")
  ]);

  return {
    calculations: calculations.map(toPublicCalculationExercise),
    journalEntries: journalEntries.map(toPublicJournalEntryExercise),
    diagnoses: diagnoses.map(toPublicErrorDiagnosisExercise),
    cases: cases.map(toPublicProgressiveCase)
  };
}

export interface ChapterSourceEntry {
  reference: PublicSourceReference;
  /** Les contenus du chapitre qui citent cette source. */
  citedBy: Array<{ title: string; artifactType: string }>;
}

/**
 * Le panneau « Sources ».
 *
 * Il agrège les références de *tous* les contenus actifs du chapitre — c'est le
 * seul onglet qui ouvre chaque instantané, et c'est justifié : sa raison d'être
 * est précisément de dire « voici tout ce sur quoi ce chapitre s'appuie ».
 */
export async function loadChapterSources(chapterSlug: string): Promise<ChapterSourceEntry[]> {
  const entries = await listChapterEntries(COMPTA_APPROFONDIE_MODULE, chapterSlug);
  const byKey = new Map<string, ChapterSourceEntry>();

  for (const entry of entries) {
    const version = await loadPublishedVersion(entry.id);

    if (!version) {
      continue;
    }

    for (const reference of toPublicSourceReferences(version.sourceReferencesSnapshot)) {
      const key = `${reference.documentId}:${reference.pageStart}-${reference.pageEnd}:${reference.sectionTitle ?? ""}`;
      const existing = byKey.get(key);

      if (existing) {
        existing.citedBy.push({ title: version.title, artifactType: version.artifactType });
        continue;
      }

      byKey.set(key, {
        reference,
        citedBy: [{ title: version.title, artifactType: version.artifactType }]
      });
    }
  }

  return [...byKey.values()].sort((left, right) => {
    const byDocument = left.reference.documentTitle.localeCompare(right.reference.documentTitle);

    return byDocument !== 0 ? byDocument : left.reference.pageStart - right.reference.pageStart;
  });
}

// --- Progression -----------------------------------------------------------

export interface ChapterProgressView {
  progress: ChapterProgress;
  /** Vrai quand un compte identifié porte cette progression. */
  personal: boolean;
  /** Vrai quand la progression n'a pas pu être chargée (base indisponible). */
  unavailable: boolean;
}

/**
 * La progression du lecteur sur ce chapitre.
 *
 * TROIS CAS, JAMAIS CONFONDUS. Un visiteur sans compte n'a pas de progression
 * serveur : `personal: false`, et l'écran l'invite à se connecter sans rien lui
 * attribuer. Une base indisponible est `unavailable: true` : l'écran dit que
 * l'avancement n'a pas pu être chargé, ce qui n'est pas « non commencé ». Un
 * compte sans activité rend « non commencé », qui est un fait.
 */
export async function loadChapterProgress(chapterSlug: string): Promise<ChapterProgressView> {
  const overview = await loadChapterOverview(chapterSlug);
  const catalogue = catalogueFromArtifactTypes(Object.keys(overview?.counts ?? {}));
  const empty = computeChapterProgress([], catalogue);
  const user = await getCurrentUser();

  if (!user) {
    return { progress: empty, personal: false, unavailable: false };
  }

  try {
    const rows = await getChapterActivity(user.id, COMPTA_APPROFONDIE_MODULE, chapterSlug);
    const events: ChapterActivityEvent[] = rows.map((row) => ({
      kind: row.kind as ChapterActivityEvent["kind"],
      artifactId: row.artifactId,
      succeeded: row.succeeded,
      occurredAt: row.occurredAt
    }));

    return { progress: computeChapterProgress(events, catalogue), personal: true, unavailable: false };
  } catch (error) {
    // Une progression illisible ne doit pas empêcher de lire le chapitre : le
    // contenu public ne dépend d'aucune base.
    console.error("[chapter-progress]", error);
    return { progress: empty, personal: true, unavailable: true };
  }
}
