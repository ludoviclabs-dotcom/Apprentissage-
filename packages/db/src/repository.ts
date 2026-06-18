import { basename } from "node:path";
import { asc, desc, eq, ilike, inArray } from "drizzle-orm";
import {
  attempts as seedAttempts,
  buildRevisionSession,
  businessCases as seedBusinessCases,
  competencies,
  concepts as seedConcepts,
  corrections as seedCorrections,
  createErrorJournalEntries,
  documents as seedDocuments,
  errorJournalEntries as seedErrorJournalEntries,
  examSessions as seedExamSessions,
  exercises,
  flashcards as seedFlashcards,
  learningPath,
  learningModules as seedLearningModules,
  lessons,
  reviewFlashcardSchedule,
  scoreBusinessCase,
  sourcePacks as seedSourcePacks,
  startExamSession,
  type Attempt,
  type BusinessCase,
  type BusinessCaseAttempt,
  type Competency,
  type CompetencyStatus,
  type Concept,
  type Correction,
  type DocumentRecord,
  type ErrorJournalEntry,
  type ExamSession,
  type Exercise,
  type Flashcard,
  type LearningDay,
  type LearningPath,
  type LearningModule,
  type Lesson,
  type RemediationPlan,
  type ReviewRating,
  type RubricItem,
  type RubricScore,
  type SourceReference,
  type SourcePack
} from "@finance/domain";
import { chunkMarkdown, extractDocument, type SourcePackManifest } from "@finance/ingest";
import { createDb, canUseDatabase } from "./client";
import {
  attemptsTable,
  businessCaseAttemptsTable,
  businessCasesTable,
  chunksTable,
  competenciesTable,
  documentPagesTable,
  correctionsTable,
  documentsTable,
  errorJournalTable,
  examSessionsTable,
  exercisesTable,
  flashcardsTable,
  learningDaysTable,
  learningPathsTable,
  lessonsTable,
  lessonSourcesTable,
  modulesTable,
  revisionReviewsTable,
  revisionItemsTable,
  sourcePacksTable
} from "./drizzle-schema";

function toSourcePack(row: typeof sourcePacksTable.$inferSelect): SourcePack {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    domainId: row.domain as SourcePack["domainId"],
    versionLabel: row.versionLabel,
    effectiveDate: row.effectiveDate?.slice(0, 10) ?? "",
    importedAt: row.importedAt?.slice(0, 10) ?? "",
    status: row.status as SourcePack["status"],
    documentsCount: 0,
    chunksCount: 0
  };
}

function toDocument(row: typeof documentsTable.$inferSelect): DocumentRecord {
  return {
    id: row.id,
    sourcePackId: row.sourcePackId,
    filename: row.filename,
    fileType: row.fileType as DocumentRecord["fileType"],
    domainId: row.domain as DocumentRecord["domainId"],
    title: row.title,
    originalPath: row.originalPath,
    checksum: row.checksum,
    importedAt: row.importedAt?.slice(0, 10) ?? "",
    pages: 0,
    status: "ready"
  };
}

function parseRubric(value: unknown): RubricItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is RubricItem => {
      return (
        typeof item === "object" &&
        item !== null &&
        "label" in item &&
        "points" in item &&
        typeof item.label === "string" &&
        typeof item.points === "number"
      );
    })
    .map((item) => ({ label: item.label, points: item.points }));
}

function toExercise(row: typeof exercisesTable.$inferSelect): Exercise {
  return {
    id: row.id,
    domainId: row.domain as Exercise["domainId"],
    type: row.type as Exercise["type"],
    title: row.topic,
    level: row.level,
    estimatedMinutes: row.estimatedMinutes,
    statement: row.statement,
    expectedAnswer: row.expectedAnswer,
    rubric: parseRubric(row.rubricJson),
    competencyIds: row.competencyIds,
    sourceChunkIds: row.sourceChunkIds
  };
}

function toCompetency(row: typeof competenciesTable.$inferSelect): Competency {
  return {
    id: row.id,
    domainId: row.domain as Competency["domainId"],
    name: row.name,
    levelMin: row.levelMin,
    levelMax: row.levelMax,
    status: row.status as CompetencyStatus,
    strength: row.strength,
    focus: ""
  };
}

function toLesson(
  row: typeof lessonsTable.$inferSelect,
  sourceReferences: SourceReference[] = []
): Lesson {
  return {
    id: row.id,
    domainId: row.domain as Lesson["domainId"],
    title: row.title,
    concept: row.concept,
    rule: row.rule,
    reasoning: row.reasoning,
    example: row.example,
    frequentError: row.frequentError,
    linkedExerciseId: row.linkedExerciseId ?? "",
    sourceReferences
  };
}

function toSourceReference(row: typeof lessonSourcesTable.$inferSelect): SourceReference {
  return {
    pack: row.pack,
    document: row.document,
    sourceType: row.sourceType as SourceReference["sourceType"],
    pageStart: row.pageStart ?? undefined,
    pageEnd: row.pageEnd ?? undefined,
    effectiveDate: row.effectiveDate?.slice(0, 10)
  };
}

function toLearningDay(row: typeof learningDaysTable.$inferSelect): LearningDay {
  return {
    day: row.dayNumber,
    title: row.title,
    domainId: row.domain as LearningDay["domainId"],
    competencyIds: row.competencyIds,
    lessonId: row.lessonId,
    exerciseId: row.exerciseId,
    minutes: row.minutes,
    status: row.status as LearningDay["status"]
  };
}

function parseJsonObject<T>(value: unknown, fallback: T): T {
  return typeof value === "object" && value !== null ? (value as T) : fallback;
}

function parseJsonArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toLearningModule(row: typeof modulesTable.$inferSelect): LearningModule {
  return parseJsonObject(row.payloadJson, seedLearningModules.find((module) => module.id === row.id) ?? seedLearningModules[0]);
}

function toFlashcard(row: typeof flashcardsTable.$inferSelect): Flashcard {
  return {
    id: row.id,
    moduleId: row.moduleId,
    conceptId: row.conceptId,
    domainId: row.domain as Flashcard["domainId"],
    type: row.type as Flashcard["type"],
    front: row.front,
    back: row.back,
    explanation: row.explanation,
    competencyIds: row.competencyIds,
    status: row.status as Flashcard["status"],
    dueAt: row.dueAt,
    intervalDays: row.intervalDays,
    sourceReferences: parseJsonArray<SourceReference>(row.sourceReferencesJson)
  };
}

function toErrorJournalEntry(row: typeof errorJournalTable.$inferSelect): ErrorJournalEntry {
  return {
    id: row.id,
    exerciseId: row.exerciseId,
    correctionId: row.correctionId,
    category: row.category as ErrorJournalEntry["category"],
    summary: row.summary,
    competencyIds: row.competencyIds,
    nextAction: row.nextAction,
    createdAt: row.createdAt
  };
}

function toExamSession(row: typeof examSessionsTable.$inferSelect): ExamSession {
  return {
    id: row.id,
    title: row.title,
    exerciseIds: row.exerciseIds,
    durationMinutes: row.durationMinutes,
    status: row.status as ExamSession["status"],
    startedAt: row.startedAt ?? undefined,
    submittedAt: row.submittedAt ?? undefined,
    score: row.score ?? undefined
  };
}

function toBusinessCase(row: typeof businessCasesTable.$inferSelect): BusinessCase {
  return parseJsonObject(row.payloadJson, seedBusinessCases.find((businessCase) => businessCase.id === row.id) ?? seedBusinessCases[0]);
}

function toAttempt(row: typeof attemptsTable.$inferSelect): Attempt {
  const correctionJson = row.correctionJson as Partial<Correction>;

  return {
    id: row.id,
    exerciseId: row.exerciseId,
    userAnswer: row.userAnswer,
    score: row.score,
    correctionId: correctionJson.id ?? `corr-${row.id}`,
    createdAt: row.createdAt
  };
}

function toCorrection(row: typeof attemptsTable.$inferSelect): Correction | null {
  const correctionJson = row.correctionJson as Partial<Correction>;

  if (!correctionJson.id || !correctionJson.exerciseId || typeof correctionJson.score !== "number") {
    return null;
  }

  return completeCorrection(correctionJson);
}

function clampStrength(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusFromStrength(strength: number): CompetencyStatus {
  if (strength >= 75) {
    return "mastered";
  }

  if (strength >= 45) {
    return "in-progress";
  }

  if (strength > 0) {
    return "fragile";
  }

  return "not-started";
}

function defaultRemediationPlan(correction: Partial<Correction>): RemediationPlan {
  return {
    microLesson:
      "Reprendre la reponse en quatre blocs : fait, regle, traitement, conclusion sourcee.",
    nextAction: correction.remediation ?? "Refaire un mini-cas court avec le meme bareme.",
    competencyTags: [],
    expectedAnswer: "Comparer la reponse au corrige attendu puis citer les sources utiles."
  };
}

function completeCorrection(correction: Partial<Correction>): Correction {
  const correct = correction.correct ?? [];
  const errors = correction.errors ?? [];

  return {
    id: correction.id ?? `corr-fallback-${Date.now()}`,
    exerciseId: correction.exerciseId ?? "",
    score: correction.score ?? 0,
    summary: correction.summary ?? "",
    rubricScores: correction.rubricScores ?? [],
    correct,
    partialPoints: correction.partialPoints ?? [],
    errors,
    calculationErrors: correction.calculationErrors ?? [],
    accountingTreatmentErrors: correction.accountingTreatmentErrors ?? errors,
    reasoningErrors: correction.reasoningErrors ?? [],
    sourceQualityIssues: correction.sourceQualityIssues ?? [],
    missingElements: correction.missingElements ?? [],
    remediation: correction.remediation ?? "",
    remediationPlan: correction.remediationPlan ?? defaultRemediationPlan(correction),
    sourceReferences: correction.sourceReferences ?? []
  };
}

export interface KnowledgeHit {
  content: string;
  confidence: number;
  source: {
    pack: string;
    document: string;
    sourceType: "course" | "official-reference" | "personal-note" | "exercise";
    pageStart?: number;
    pageEnd?: number;
    effectiveDate?: string;
  };
}

export async function getSourcePacks(): Promise<SourcePack[]> {
  if (!canUseDatabase()) {
    return seedSourcePacks;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(sourcePacksTable).orderBy(desc(sourcePacksTable.importedAt));
    return rows.map(toSourcePack);
  } catch {
    return seedSourcePacks;
  }
}

export async function getDocuments(): Promise<DocumentRecord[]> {
  if (!canUseDatabase()) {
    return seedDocuments;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(documentsTable).orderBy(desc(documentsTable.importedAt));
    return rows.map(toDocument);
  } catch {
    return seedDocuments;
  }
}

export async function getExercises(): Promise<Exercise[]> {
  if (!canUseDatabase()) {
    return exercises;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(exercisesTable).orderBy(desc(exercisesTable.level));
    return rows.map(toExercise);
  } catch {
    return exercises;
  }
}

export async function getCompetencies(): Promise<Competency[]> {
  if (!canUseDatabase()) {
    return competencies;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(competenciesTable);
    return rows.map(toCompetency);
  } catch {
    return competencies;
  }
}

export async function getLessons(): Promise<Lesson[]> {
  if (!canUseDatabase()) {
    return lessons;
  }

  try {
    const db = createDb();
    const lessonRows = await db.select().from(lessonsTable).orderBy(asc(lessonsTable.title));

    if (lessonRows.length === 0) {
      return lessons;
    }

    const sourceRows = await db
      .select()
      .from(lessonSourcesTable)
      .where(inArray(lessonSourcesTable.lessonId, lessonRows.map((lesson) => lesson.id)));

    const sourcesByLesson = new Map<string, SourceReference[]>();

    for (const source of sourceRows) {
      const existing = sourcesByLesson.get(source.lessonId) ?? [];
      existing.push(toSourceReference(source));
      sourcesByLesson.set(source.lessonId, existing);
    }

    return lessonRows.map((lesson) => toLesson(lesson, sourcesByLesson.get(lesson.id) ?? []));
  } catch {
    return lessons;
  }
}

export async function getLearningPath(): Promise<LearningPath> {
  if (!canUseDatabase()) {
    return learningPath;
  }

  try {
    const db = createDb();
    const pathRows = await db.select().from(learningPathsTable).limit(1);
    const path = pathRows[0];

    if (!path) {
      return learningPath;
    }

    const dayRows = await db
      .select()
      .from(learningDaysTable)
      .where(eq(learningDaysTable.learningPathId, path.id))
      .orderBy(asc(learningDaysTable.dayNumber));

    return {
      id: path.id,
      name: path.name,
      durationDays: path.durationDays,
      currentDay: path.currentDay,
      goal: path.goal,
      days: dayRows.length > 0 ? dayRows.map(toLearningDay) : learningPath.days
    };
  } catch {
    return learningPath;
  }
}

export async function recordManifest(manifest: SourcePackManifest): Promise<SourcePack> {
  const id = manifest.rootPath.replaceAll("\\", "/").split("/").filter(Boolean).at(-1) ?? "source-pack";
  const now = new Date().toISOString();
  const pack: SourcePack = {
    id,
    name: id,
    description: `Pack détecté depuis ${manifest.rootPath}`,
    domainId: manifest.domainId === "unknown" ? "finance" : manifest.domainId,
    versionLabel: "manual-import",
    effectiveDate: now.slice(0, 10),
    importedAt: now.slice(0, 10),
    status: "needs-review",
    documentsCount: manifest.files.length,
    chunksCount: 0
  };

  if (!canUseDatabase()) {
    return pack;
  }

  const db = createDb();
  await db
    .insert(sourcePacksTable)
    .values({
      id: pack.id,
      name: pack.name,
      description: pack.description,
      domain: pack.domainId,
      versionLabel: pack.versionLabel,
      effectiveDate: pack.effectiveDate,
      importedAt: now,
      status: pack.status
    })
    .onConflictDoUpdate({
      target: sourcePacksTable.id,
      set: {
        description: pack.description,
        domain: pack.domainId,
        importedAt: now,
        status: pack.status
      }
    });

  for (const file of manifest.files) {
    const documentId = `${pack.id}-${file.checksum.slice(0, 12)}`;
    const title = basename(file.path).replace(/\.[^.]+$/, "").replaceAll("-", " ");
    await db
      .insert(documentsTable)
      .values({
        id: documentId,
        sourcePackId: pack.id,
        filename: basename(file.path),
        fileType: file.extension.slice(1),
        domain: pack.domainId,
        title,
        originalPath: `${manifest.rootPath}/${file.path}`.replaceAll("\\", "/"),
        checksum: file.checksum,
        importedAt: now
      })
      .onConflictDoUpdate({
        target: documentsTable.id,
        set: {
          title,
          originalPath: `${manifest.rootPath}/${file.path}`.replaceAll("\\", "/"),
          checksum: file.checksum,
          importedAt: now
        }
      });

    if (file.extension !== ".md") {
      continue;
    }

    const extracted = await extractDocument(manifest.rootPath, file);
    const chunks = chunkMarkdown(extracted);
    await db
      .insert(documentPagesTable)
      .values({
        id: `${documentId}-page-1`,
        documentId,
        pageNumber: 1,
        rawText: extracted.rawText,
        markdownText: extracted.markdownText,
        extractedTablesJson: []
      })
      .onConflictDoUpdate({
        target: documentPagesTable.id,
        set: {
          rawText: extracted.rawText,
          markdownText: extracted.markdownText,
          extractedTablesJson: []
        }
      });

    for (const chunk of chunks) {
      await db
        .insert(chunksTable)
        .values({
          id: chunk.id,
          documentId,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          sectionTitle: chunk.sectionTitle,
          content: chunk.content,
          contentHash: chunk.contentHash,
          domain: pack.domainId,
          topic: chunk.sectionTitle,
          difficulty: 1,
          effectiveDate: pack.effectiveDate,
          sourceType: "personal-note"
        })
        .onConflictDoNothing();
    }
  }

  return pack;
}

export async function getLearningState() {
  return {
    competencies: await getCompetencies(),
    exercises: await getExercises(),
    learningPath: await getLearningPath(),
    lessons: await getLessons(),
    modules: await getLearningModules(),
    concepts: await getConcepts(),
    flashcards: await getFlashcards()
  };
}

export async function getLearningModules(): Promise<LearningModule[]> {
  if (!canUseDatabase()) {
    return seedLearningModules;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(modulesTable).orderBy(asc(modulesTable.title));
    return rows.length > 0 ? rows.map(toLearningModule) : seedLearningModules;
  } catch {
    return seedLearningModules;
  }
}

export async function getConcepts(): Promise<Concept[]> {
  return seedConcepts;
}

export async function getFlashcards(): Promise<Flashcard[]> {
  if (!canUseDatabase()) {
    return seedFlashcards;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(flashcardsTable).orderBy(asc(flashcardsTable.dueAt));
    return rows.length > 0 ? rows.map(toFlashcard) : seedFlashcards;
  } catch {
    return seedFlashcards;
  }
}

export async function getRevisionSession(now = new Date()) {
  return buildRevisionSession(await getFlashcards(), now);
}

export async function reviewFlashcard(flashcardId: string, rating: ReviewRating) {
  const review = reviewFlashcardSchedule(flashcardId, rating);

  if (!canUseDatabase()) {
    return review;
  }

  const db = createDb();
  await db
    .update(flashcardsTable)
    .set({
      status: review.nextStatus,
      dueAt: review.nextDueAt,
      intervalDays: review.intervalDays
    })
    .where(eq(flashcardsTable.id, flashcardId));
  await db.insert(revisionReviewsTable).values({
    id: `review-${flashcardId}-${Date.now()}`,
    flashcardId,
    rating,
    reviewedAt: review.reviewedAt,
    nextDueAt: review.nextDueAt,
    intervalDays: review.intervalDays
  });

  return review;
}

export async function getErrorJournal(): Promise<ErrorJournalEntry[]> {
  if (!canUseDatabase()) {
    return seedErrorJournalEntries;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(errorJournalTable).orderBy(desc(errorJournalTable.createdAt));
    return rows.length > 0 ? rows.map(toErrorJournalEntry) : seedErrorJournalEntries;
  } catch {
    return seedErrorJournalEntries;
  }
}

export async function getExamSessions(): Promise<ExamSession[]> {
  if (!canUseDatabase()) {
    return seedExamSessions;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(examSessionsTable).orderBy(asc(examSessionsTable.title));
    return rows.length > 0 ? rows.map(toExamSession) : seedExamSessions;
  } catch {
    return seedExamSessions;
  }
}

export async function startExam(examId: string) {
  const template = (await getExamSessions()).find((exam) => exam.id === examId) ?? seedExamSessions[0];
  const session = startExamSession(template);

  if (!canUseDatabase()) {
    return session;
  }

  const db = createDb();
  await db.insert(examSessionsTable).values({
    id: session.id,
    title: session.title,
    exerciseIds: session.exerciseIds,
    durationMinutes: session.durationMinutes,
    status: session.status,
    startedAt: session.startedAt,
    submittedAt: session.submittedAt,
    score: session.score
  });

  return session;
}

export async function submitExamAnswers(
  exerciseAnswers: Array<{ exerciseId: string; userAnswer: string }>
) {
  const corrections = [];

  for (const answer of exerciseAnswers) {
    const exercise = await getExerciseById(answer.exerciseId);

    if (!exercise) {
      continue;
    }

    corrections.push(gradeExercise(exercise, answer.userAnswer));
  }

  const score =
    corrections.length === 0
      ? 0
      : Math.round(corrections.reduce((sum, correction) => sum + correction.score, 0) / corrections.length);

  return {
    score,
    corrections,
    submittedAt: new Date().toISOString()
  };
}

export async function getBusinessCases(): Promise<BusinessCase[]> {
  if (!canUseDatabase()) {
    return seedBusinessCases;
  }

  try {
    const db = createDb();
    const rows = await db.select().from(businessCasesTable).orderBy(desc(businessCasesTable.level));
    return rows.length > 0 ? rows.map(toBusinessCase) : seedBusinessCases;
  } catch {
    return seedBusinessCases;
  }
}

export async function submitBusinessCaseAttempt(
  businessCaseId: string,
  userMemo: string
): Promise<BusinessCaseAttempt | null> {
  const businessCase = (await getBusinessCases()).find((item) => item.id === businessCaseId);

  if (!businessCase) {
    return null;
  }

  const attempt = scoreBusinessCase(businessCase, userMemo);

  if (canUseDatabase()) {
    const db = createDb();
    await db.insert(businessCaseAttemptsTable).values({
      id: attempt.id,
      businessCaseId: attempt.businessCaseId,
      userMemo: attempt.userMemo,
      score: attempt.score,
      correction: attempt.correction,
      createdAt: attempt.createdAt
    });
  }

  return attempt;
}

export async function getProgressSnapshot() {
  const [competencies, modules, concepts, errorJournal, revisionSession] = await Promise.all([
    getCompetencies(),
    getLearningModules(),
    getConcepts(),
    getErrorJournal(),
    getRevisionSession()
  ]);

  return {
    competencies,
    modules,
    concepts,
    errorJournal,
    revisionSession
  };
}

function _gradeExerciseLegacy(exercise: Exercise, userAnswer: string) {
  const normalized = userAnswer.toLowerCase();
  const rubricScore = exercise.rubric.reduce((score, item) => {
    const keyword = item.label.toLowerCase().split(" ")[0];
    return normalized.includes(keyword) ? score + item.points : score;
  }, 0);
  const score = Math.max(6, Math.min(20, rubricScore + Math.min(6, Math.floor(userAnswer.length / 120))));

  return {
    id: `corr-${exercise.id}-${Date.now()}`,
    exerciseId: exercise.id,
    score,
    summary:
      score >= 14
        ? "Réponse solide : la logique principale est présente, avec quelques justifications à renforcer."
        : "Réponse exploitable mais fragile : il faut expliciter la règle, la preuve et la conséquence comptable.",
    correct: score >= 12 ? ["Le sujet est compris.", "La réponse contient un raisonnement exploitable."] : ["Une partie du problème est identifiée."],
    errors:
      score >= 14
        ? ["Ajouter des sources et mieux isoler l'hypothèse clé."]
        : ["La justification normative est trop courte.", "La conclusion opérationnelle reste insuffisante."],
    remediation: "Refaire la réponse en quatre blocs : fait, règle, calcul ou traitement, conclusion sourcée.",
    sourceReferences: []
  };
}

const STOP_WORDS = new Set([
  "avec",
  "dans",
  "des",
  "du",
  "elle",
  "est",
  "les",
  "pour",
  "que",
  "qui",
  "sur",
  "une"
]);

const CRITERION_TERMS: Record<string, string[]> = {
  "ex-provision-litige:qualification obligation/probabilite/estimation": [
    "obligation",
    "probable",
    "probabilite",
    "sortie de ressources",
    "estimation fiable",
    "provision"
  ],
  "ex-provision-litige:rattachement a la cloture": [
    "31/12",
    "cloture",
    "avant la cloture",
    "fait generateur",
    "periode"
  ],
  "ex-provision-litige:ecriture et justification": [
    "dotation",
    "debit",
    "credit",
    "compte",
    "14000",
    "14 000",
    "12 000",
    "16 000"
  ],
  "ex-provision-litige:limites et annexe": [
    "annexe",
    "incertitude",
    "fourchette",
    "information",
    "limite"
  ],
  "ex-ias37-comparison:criteres ias 37": [
    "ias 37",
    "obligation actuelle",
    "sortie probable",
    "estimation fiable",
    "passif eventuel",
    "provision"
  ],
  "ex-ias37-comparison:comparaison pcg": [
    "pcg",
    "prudence",
    "francais",
    "regle comptable",
    "comptabilite generale"
  ],
  "ex-ias37-comparison:qualite de la justification": [
    "source",
    "preuve",
    "document",
    "page",
    "citer",
    "justification"
  ],
  "ex-ias37-comparison:conclusion operationnelle": [
    "conclusion",
    "comptabiliser",
    "annexe",
    "traitement",
    "recommandation"
  ]
};

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueSources(sources: SourceReference[]) {
  const seen = new Set<string>();

  return sources.filter((source) => {
    const key = `${source.pack}:${source.document}:${source.pageStart ?? ""}:${source.effectiveDate ?? ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getExerciseSourceReferences(exercise: Exercise): SourceReference[] {
  const linkedLessons = lessons.filter((lesson) => lesson.linkedExerciseId === exercise.id);

  if (linkedLessons.length > 0) {
    return uniqueSources(linkedLessons.flatMap((lesson) => lesson.sourceReferences));
  }

  return uniqueSources(
    lessons
      .filter((lesson) => lesson.domainId === exercise.domainId)
      .flatMap((lesson) => lesson.sourceReferences)
  );
}

function genericCriterionTerms(exercise: Exercise, item: RubricItem) {
  const terms = `${item.label} ${exercise.expectedAnswer}`
    .split(/[^A-Za-z0-9]+/)
    .map((part) => normalizeForMatch(part))
    .filter((part) => part.length > 3 && !STOP_WORDS.has(part));

  return [...new Set(terms)].slice(0, 8);
}

function termsForCriterion(exercise: Exercise, item: RubricItem) {
  return CRITERION_TERMS[`${exercise.id}:${normalizeForMatch(item.label)}`] ?? genericCriterionTerms(exercise, item);
}

function countMatches(answer: string, terms: string[]) {
  return terms.filter((term) => answer.includes(normalizeForMatch(term))).length;
}

function scoreRubricItem(exercise: Exercise, item: RubricItem, normalizedAnswer: string): RubricScore {
  const terms = termsForCriterion(exercise, item);
  const matches = countMatches(normalizedAnswer, terms);
  const ratio = terms.length === 0 ? 0 : matches / terms.length;
  const awardedPoints =
    ratio >= 0.65
      ? item.points
      : ratio >= 0.4
        ? Math.ceil(item.points * 0.7)
        : ratio >= 0.2
          ? Math.ceil(item.points * 0.4)
          : 0;

  return {
    criterion: item.label,
    maxPoints: item.points,
    awardedPoints,
    justification:
      awardedPoints === item.points
        ? "Critere traite avec les notions attendues."
        : awardedPoints > 0
          ? "Critere partiellement traite : la logique est presente mais certains mots-preuves manquent."
          : "Critere non etaye dans la reponse."
  };
}

function hasAny(answer: string, terms: string[]) {
  return terms.some((term) => answer.includes(normalizeForMatch(term)));
}

function classifyErrors(exercise: Exercise, normalizedAnswer: string) {
  const calculationErrors: string[] = [];
  const accountingTreatmentErrors: string[] = [];
  const reasoningErrors: string[] = [];
  const sourceQualityIssues: string[] = [];
  const missingElements: string[] = [];

  if (exercise.id === "ex-provision-litige") {
    if (!hasAny(normalizedAnswer, ["14 000", "14000", "12 000", "12000", "16 000", "16000"])) {
      missingElements.push("Montant ou fourchette d'estimation non exploite.");
    }

    if (hasAny(normalizedAnswer, ["18 000", "18000"]) && !hasAny(normalizedAnswer, ["14 000", "14000", "fourchette"])) {
      calculationErrors.push("Le montant reclame de 18 000 EUR semble repris sans discuter la meilleure estimation.");
    }

    if (!hasAny(normalizedAnswer, ["obligation", "probable", "estimation", "sortie"])) {
      accountingTreatmentErrors.push("Les conditions de provision ne sont pas separees : obligation, sortie probable, estimation fiable.");
    }

    if (!hasAny(normalizedAnswer, ["annexe", "incertitude", "fourchette"])) {
      accountingTreatmentErrors.push("L'information en annexe ou l'incertitude n'est pas mentionnee.");
      missingElements.push("Mention de l'annexe lorsque l'incertitude reste significative.");
    }
  }

  if (exercise.id === "ex-ias37-comparison") {
    if (hasAny(normalizedAnswer, ["identique", "toujours", "sans distinguer"])) {
      accountingTreatmentErrors.push("La reponse ecrase les differences PCG/IAS 37 ou automatise trop vite la provision.");
    }

    if (!hasAny(normalizedAnswer, ["ias 37", "obligation actuelle", "sortie probable", "estimation fiable"])) {
      accountingTreatmentErrors.push("Les criteres IAS 37 ne sont pas cites de facon exploitable.");
    }

    if (!hasAny(normalizedAnswer, ["pcg", "prudence", "francais"])) {
      missingElements.push("Comparaison explicite avec le PCG.");
    }

    if (!hasAny(normalizedAnswer, ["annexe", "passif eventuel", "information"])) {
      accountingTreatmentErrors.push("La distinction provision, passif eventuel et information en annexe manque.");
    }
  }

  if (!hasAny(normalizedAnswer, ["car", "parce", "donc", "justifie", "preuve", "conclusion"])) {
    reasoningErrors.push("Le raisonnement ne relie pas assez les faits, la regle et la conclusion.");
  }

  if (!hasAny(normalizedAnswer, ["source", "page", "document", "pack", "cours"])) {
    sourceQualityIssues.push("La reponse ne cite pas explicitement de document, page ou pack.");
  }

  return {
    calculationErrors,
    accountingTreatmentErrors,
    reasoningErrors,
    sourceQualityIssues,
    missingElements: [...new Set(missingElements)]
  };
}

function buildRemediationPlan(exercise: Exercise, categories: ReturnType<typeof classifyErrors>): RemediationPlan {
  const firstGap =
    categories.accountingTreatmentErrors[0] ??
    categories.calculationErrors[0] ??
    categories.reasoningErrors[0] ??
    categories.missingElements[0] ??
    "Renforcer la justification sourcee.";
  const nextExerciseId = learningPath.days.find((day) => day.exerciseId !== exercise.id)?.exerciseId;

  return {
    microLesson: `Point a reprendre : ${firstGap}`,
    nextAction: "Reecrire la reponse en quatre blocs : fait, regle, traitement, conclusion sourcee.",
    competencyTags: exercise.competencyIds,
    expectedAnswer: exercise.expectedAnswer,
    nextExerciseId
  };
}

export function gradeExercise(exercise: Exercise, userAnswer: string): Correction {
  const normalizedAnswer = normalizeForMatch(userAnswer);
  const rubricScores = exercise.rubric.map((item) => scoreRubricItem(exercise, item, normalizedAnswer));
  const score = Math.max(
    0,
    Math.min(
      20,
      rubricScores.reduce((sum, item) => sum + item.awardedPoints, 0)
    )
  );
  const categories = classifyErrors(exercise, normalizedAnswer);
  const partialPoints = rubricScores
    .filter((item) => item.awardedPoints > 0 && item.awardedPoints < item.maxPoints)
    .map((item) => `${item.criterion} : ${item.awardedPoints}/${item.maxPoints}. ${item.justification}`);
  const correct = rubricScores
    .filter((item) => item.awardedPoints === item.maxPoints)
    .map((item) => `${item.criterion} : critere acquis.`);
  const missingFromRubric = rubricScores
    .filter((item) => item.awardedPoints === 0)
    .map((item) => `${item.criterion} non traite.`);
  const errors = [
    ...categories.calculationErrors,
    ...categories.accountingTreatmentErrors,
    ...categories.reasoningErrors,
    ...categories.sourceQualityIssues
  ];
  const sourceReferences = getExerciseSourceReferences(exercise);
  const remediationPlan = buildRemediationPlan(exercise, categories);

  return {
    id: `corr-${exercise.id}-${Date.now()}`,
    exerciseId: exercise.id,
    score,
    summary:
      score >= 16
        ? "Reponse solide : le bareme est largement couvert et les points de preuve sont exploitables."
        : score >= 10
          ? "Reponse partielle : la logique principale existe, mais la justification doit etre mieux structuree."
          : "Reponse fragile : reprendre les criteres du bareme avant de conclure.",
    rubricScores,
    correct: correct.length > 0 ? correct : ["Le sujet est aborde, mais aucun critere n'est completement acquis."],
    partialPoints,
    errors,
    calculationErrors: categories.calculationErrors,
    accountingTreatmentErrors: categories.accountingTreatmentErrors,
    reasoningErrors: categories.reasoningErrors,
    sourceQualityIssues: categories.sourceQualityIssues,
    missingElements: [...new Set([...categories.missingElements, ...missingFromRubric])],
    remediation: remediationPlan.nextAction,
    remediationPlan,
    sourceReferences
  };
}

export async function recordAttempt(exerciseId: string, userAnswer: string, correction: Correction) {
  if (!canUseDatabase()) {
    return;
  }

  const db = createDb();
  const attemptId = `attempt-${Date.now()}`;
  await db.insert(attemptsTable).values({
    id: attemptId,
    exerciseId,
    userAnswer,
    score: correction.score,
    correctionJson: correction,
    createdAt: new Date().toISOString()
  });
  await db.insert(correctionsTable).values({
    id: correction.id,
    attemptId,
    score: correction.score,
    summary: correction.summary,
    correctJson: correction.correct,
    errorsJson: correction.errors,
    remediation: correction.remediation
  });

  for (const entry of createErrorJournalEntries(correction)) {
    await db.insert(errorJournalTable).values({
      id: entry.id,
      exerciseId: entry.exerciseId,
      correctionId: entry.correctionId,
      category: entry.category,
      summary: entry.summary,
      competencyIds: entry.competencyIds,
      nextAction: entry.nextAction,
      createdAt: entry.createdAt
    });
  }

  const exercise = await getExerciseById(exerciseId);

  if (!exercise || exercise.competencyIds.length === 0) {
    return;
  }

  const competencyRows = await db
    .select()
    .from(competenciesTable)
    .where(inArray(competenciesTable.id, exercise.competencyIds));

  for (const competency of competencyRows) {
    const delta = correction.score >= 14 ? 8 : correction.score >= 10 ? 3 : -6;
    const nextStrength = clampStrength(competency.strength + delta);
    await db
      .update(competenciesTable)
      .set({
        strength: nextStrength,
        status: statusFromStrength(nextStrength)
      })
      .where(eq(competenciesTable.id, competency.id));

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (correction.score >= 14 ? 7 : correction.score >= 10 ? 3 : 1));

    await db.insert(revisionItemsTable).values({
      id: `revision-${competency.id}-${Date.now()}`,
      competencyId: competency.id,
      dueAt: dueDate.toISOString(),
      strength: nextStrength,
      lastReviewedAt: new Date().toISOString()
    });
  }
}

export async function recordDiagnostic(levels: Record<string, number>) {
  if (!canUseDatabase()) {
    return;
  }

  const db = createDb();

  for (const competency of competencies) {
    const domainLevel = levels[competency.domainId];

    if (typeof domainLevel !== "number") {
      continue;
    }

    const nextStrength = clampStrength((competency.strength + domainLevel) / 2);
    await db
      .update(competenciesTable)
      .set({
        strength: nextStrength,
        status: statusFromStrength(nextStrength)
      })
      .where(eq(competenciesTable.id, competency.id));
  }
}

export async function getCorrectionHistory(): Promise<{
  attempts: Attempt[];
  corrections: Correction[];
}> {
  if (!canUseDatabase()) {
    return {
      attempts: seedAttempts,
      corrections: seedCorrections
    };
  }

  try {
    const db = createDb();
    const rows = await db.select().from(attemptsTable).orderBy(desc(attemptsTable.createdAt));

    return {
      attempts: rows.map(toAttempt),
      corrections: rows.map(toCorrection).filter((correction): correction is Correction => correction !== null)
    };
  } catch {
    return {
      attempts: seedAttempts,
      corrections: seedCorrections
    };
  }
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Seed-mode search over the derived, committed corpus (lessons, concepts, flashcards).
// Every hit keeps its source citation. Vector search over raw chunks stays the DB-mode upgrade.
function searchSeedKnowledge(query: string, limit: number): KnowledgeHit[] {
  const tokens = normalizeSearch(query)
    .split(/\s+/)
    .filter((token) => token.length >= 3);

  if (tokens.length === 0) {
    return [];
  }

  const toSource = (ref: SourceReference): KnowledgeHit["source"] => ({
    pack: ref.pack,
    document: ref.document,
    sourceType: ref.sourceType,
    pageStart: ref.pageStart,
    pageEnd: ref.pageEnd,
    effectiveDate: ref.effectiveDate
  });

  const candidates: { content: string; haystack: string; source: KnowledgeHit["source"] }[] = [];

  for (const lesson of lessons) {
    const ref = lesson.sourceReferences[0];
    if (!ref) continue;
    candidates.push({
      content: `${lesson.title} — ${lesson.rule}`,
      haystack: normalizeSearch(`${lesson.title} ${lesson.concept} ${lesson.rule} ${lesson.reasoning} ${lesson.example} ${lesson.frequentError}`),
      source: toSource(ref)
    });
  }

  for (const concept of seedConcepts) {
    const ref = concept.sourceReferences[0];
    if (!ref) continue;
    candidates.push({
      content: `${concept.title} : ${concept.shortDefinition}`,
      haystack: normalizeSearch(`${concept.title} ${concept.shortDefinition} ${concept.frequentTrap} ${concept.miniExample} ${concept.formula ?? ""}`),
      source: toSource(ref)
    });
  }

  for (const card of seedFlashcards) {
    const ref = card.sourceReferences[0];
    if (!ref) continue;
    candidates.push({
      content: `${card.front} → ${card.back}`,
      haystack: normalizeSearch(`${card.front} ${card.back} ${card.explanation}`),
      source: toSource(ref)
    });
  }

  const scored = candidates
    .map((candidate) => {
      let score = 0;
      for (const token of tokens) {
        const occurrences = candidate.haystack.split(token).length - 1;
        if (occurrences > 0) {
          score += 1 + Math.min(occurrences, 3) * 0.2;
        }
      }
      return { candidate, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const max = scored[0]?.score ?? 1;

  return scored.map(({ candidate, score }) => ({
    content: candidate.content,
    confidence: Math.min(0.95, 0.5 + (score / max) * 0.45),
    source: candidate.source
  }));
}

export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeHit[]> {
  if (query.trim().length < 3) {
    return [];
  }

  if (!canUseDatabase()) {
    return searchSeedKnowledge(query, limit);
  }

  try {
    const db = createDb();
    const rows = await db
      .select({
        content: chunksTable.content,
        pageStart: chunksTable.pageStart,
        pageEnd: chunksTable.pageEnd,
        sourceType: chunksTable.sourceType,
        effectiveDate: chunksTable.effectiveDate,
        documentTitle: documentsTable.title,
        packName: sourcePacksTable.name
      })
      .from(chunksTable)
      .innerJoin(documentsTable, eq(chunksTable.documentId, documentsTable.id))
      .innerJoin(sourcePacksTable, eq(documentsTable.sourcePackId, sourcePacksTable.id))
      .where(ilike(chunksTable.content, `%${query.trim()}%`))
      .limit(limit);

    return rows.map((row, index) => ({
      content: row.content,
      confidence: Math.max(0.45, 0.9 - index * 0.08),
      source: {
        pack: row.packName,
        document: row.documentTitle,
        sourceType: row.sourceType as KnowledgeHit["source"]["sourceType"],
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
        effectiveDate: row.effectiveDate?.slice(0, 10)
      }
    }));
  } catch {
    return [];
  }
}

export async function getExerciseById(exerciseId: string) {
  if (!canUseDatabase()) {
    return exercises.find((exercise) => exercise.id === exerciseId);
  }

  try {
    const db = createDb();
    const rows = await db.select().from(exercisesTable).where(eq(exercisesTable.id, exerciseId)).limit(1);
    return rows[0] ? toExercise(rows[0]) : exercises.find((exercise) => exercise.id === exerciseId);
  } catch {
    return exercises.find((exercise) => exercise.id === exerciseId);
  }
}
