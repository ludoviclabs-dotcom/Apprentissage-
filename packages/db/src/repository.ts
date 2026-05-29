import { desc, eq } from "drizzle-orm";
import {
  competencies,
  documents as seedDocuments,
  exercises,
  learningPath,
  sourcePacks as seedSourcePacks,
  type Correction,
  type DocumentRecord,
  type Exercise,
  type SourcePack
} from "@finance/domain";
import type { SourcePackManifest } from "@finance/ingest";
import { createDb, canUseDatabase } from "./client";
import { attemptsTable, documentsTable, sourcePacksTable } from "./drizzle-schema";

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

  return pack;
}

export function getLearningState() {
  return {
    competencies,
    exercises,
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
  await db.insert(attemptsTable).values({
    id: `attempt-${Date.now()}`,
    exerciseId,
    userAnswer,
    score: correction.score,
    correctionJson: correction,
    createdAt: new Date().toISOString()
  });
}

export async function getExerciseById(exerciseId: string) {
  if (!canUseDatabase()) {
    return exercises.find((exercise) => exercise.id === exerciseId);
  }

  const db = createDb();
  const rows = await db.select().from(attemptsTable).where(eq(attemptsTable.exerciseId, exerciseId)).limit(1);
  void rows;
  return exercises.find((exercise) => exercise.id === exerciseId);
}
