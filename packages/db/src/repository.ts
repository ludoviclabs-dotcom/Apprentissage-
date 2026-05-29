import { basename } from "node:path";
import { desc, eq, ilike, inArray } from "drizzle-orm";
import {
  attempts as seedAttempts,
  competencies,
  corrections as seedCorrections,
  documents as seedDocuments,
  exercises,
  learningPath,
  sourcePacks as seedSourcePacks,
  type Attempt,
  type Competency,
  type CompetencyStatus,
  type Correction,
  type DocumentRecord,
  type Exercise,
  type RubricItem,
  type SourcePack
} from "@finance/domain";
import { chunkMarkdown, extractDocument, type SourcePackManifest } from "@finance/ingest";
import { createDb, canUseDatabase } from "./client";
import {
  attemptsTable,
  chunksTable,
  competenciesTable,
  correctionsTable,
  documentsTable,
  exercisesTable,
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

  return {
    id: correctionJson.id,
    exerciseId: correctionJson.exerciseId,
    score: correctionJson.score,
    summary: correctionJson.summary ?? "",
    correct: correctionJson.correct ?? [],
    errors: correctionJson.errors ?? [],
    remediation: correctionJson.remediation ?? "",
    sourceReferences: correctionJson.sourceReferences ?? []
  };
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
    learningPath
  };
}

export function gradeExercise(exercise: Exercise, userAnswer: string): Correction {
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

export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeHit[]> {
  if (!canUseDatabase() || query.trim().length < 3) {
    return [];
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
