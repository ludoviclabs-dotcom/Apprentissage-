import { integer, jsonb, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

export const sourcePacksTable = pgTable("source_packs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  domain: text("domain").notNull(),
  versionLabel: text("version_label").notNull(),
  effectiveDate: timestamp("effective_date", { mode: "string" }),
  importedAt: timestamp("imported_at", { mode: "string" }).notNull().defaultNow(),
  status: text("status").notNull()
});

export const documentsTable = pgTable("documents", {
  id: text("id").primaryKey(),
  sourcePackId: text("source_pack_id").notNull(),
  filename: text("filename").notNull(),
  fileType: varchar("file_type", { length: 16 }).notNull(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  originalPath: text("original_path").notNull(),
  checksum: text("checksum").notNull(),
  importedAt: timestamp("imported_at", { mode: "string" }).notNull().defaultNow()
});

export const documentPagesTable = pgTable("document_pages", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  rawText: text("raw_text").notNull().default(""),
  markdownText: text("markdown_text").notNull().default(""),
  extractedTablesJson: jsonb("extracted_tables_json").notNull().default([])
});

export const chunksTable = pgTable("chunks", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  pageStart: integer("page_start").notNull(),
  pageEnd: integer("page_end").notNull(),
  sectionTitle: text("section_title").notNull().default(""),
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(),
  domain: text("domain").notNull(),
  topic: text("topic").notNull().default(""),
  difficulty: integer("difficulty").notNull().default(1),
  effectiveDate: timestamp("effective_date", { mode: "string" }),
  sourceType: text("source_type").notNull()
});

export const competenciesTable = pgTable("competencies", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  name: text("name").notNull(),
  levelMin: integer("level_min").notNull(),
  levelMax: integer("level_max").notNull(),
  status: text("status").notNull(),
  strength: integer("strength").notNull()
});

export const learningPathsTable = pgTable("learning_paths", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  durationDays: integer("duration_days").notNull(),
  currentDay: integer("current_day").notNull().default(1),
  goal: text("goal").notNull()
});

export const lessonsTable = pgTable("lessons", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  concept: text("concept").notNull(),
  rule: text("rule").notNull(),
  reasoning: text("reasoning").notNull(),
  example: text("example").notNull(),
  frequentError: text("frequent_error").notNull(),
  linkedExerciseId: text("linked_exercise_id")
});

export const lessonSourcesTable = pgTable("lesson_sources", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull(),
  pack: text("pack").notNull(),
  document: text("document").notNull(),
  sourceType: text("source_type").notNull(),
  pageStart: integer("page_start"),
  pageEnd: integer("page_end"),
  effectiveDate: timestamp("effective_date", { mode: "string" })
});

export const learningDaysTable = pgTable("learning_days", {
  id: text("id").primaryKey(),
  learningPathId: text("learning_path_id").notNull(),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  competencyIds: text("competency_ids").array().notNull().default([]),
  lessonId: text("lesson_id").notNull(),
  exerciseId: text("exercise_id").notNull(),
  minutes: integer("minutes").notNull(),
  status: text("status").notNull()
});

export const exercisesTable = pgTable("exercises", {
  id: text("id").primaryKey(),
  domain: text("domain").notNull(),
  type: text("type").notNull().default("short-answer"),
  topic: text("topic").notNull(),
  level: integer("level").notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull().default(20),
  statement: text("statement").notNull(),
  expectedAnswer: text("expected_answer").notNull(),
  rubricJson: jsonb("rubric_json").notNull().default([]),
  competencyIds: text("competency_ids").array().notNull().default([]),
  sourceChunkIds: text("source_chunk_ids").array().notNull().default([])
});

export const attemptsTable = pgTable("attempts", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id").notNull(),
  userAnswer: text("user_answer").notNull(),
  score: integer("score").notNull(),
  correctionJson: jsonb("correction_json").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
});

export const correctionsTable = pgTable("corrections", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id").notNull(),
  score: integer("score").notNull(),
  summary: text("summary").notNull(),
  correctJson: jsonb("correct_json").notNull().default([]),
  errorsJson: jsonb("errors_json").notNull().default([]),
  remediation: text("remediation").notNull()
});

export const revisionItemsTable = pgTable("revision_items", {
  id: text("id").primaryKey(),
  competencyId: text("competency_id").notNull(),
  dueAt: timestamp("due_at", { mode: "string" }).notNull(),
  strength: integer("strength").notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { mode: "string" })
});

export const modulesTable = pgTable("modules", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  tier: text("tier").notNull(),
  description: text("description").notNull(),
  objective: text("objective").notNull(),
  payloadJson: jsonb("payload_json").notNull().default({})
});

export const flashcardsTable = pgTable("flashcards", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull(),
  conceptId: text("concept_id").notNull(),
  domain: text("domain").notNull(),
  type: text("type").notNull(),
  front: text("front").notNull(),
  back: text("back").notNull(),
  explanation: text("explanation").notNull(),
  competencyIds: text("competency_ids").array().notNull().default([]),
  status: text("status").notNull(),
  dueAt: timestamp("due_at", { mode: "string" }).notNull(),
  intervalDays: integer("interval_days").notNull().default(0),
  sourceReferencesJson: jsonb("source_references_json").notNull().default([])
});

export const revisionReviewsTable = pgTable("revision_reviews", {
  id: text("id").primaryKey(),
  flashcardId: text("flashcard_id").notNull(),
  rating: text("rating").notNull(),
  reviewedAt: timestamp("reviewed_at", { mode: "string" }).notNull(),
  nextDueAt: timestamp("next_due_at", { mode: "string" }).notNull(),
  intervalDays: integer("interval_days").notNull()
});

export const errorJournalTable = pgTable("error_journal", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id").notNull(),
  correctionId: text("correction_id").notNull(),
  category: text("category").notNull(),
  summary: text("summary").notNull(),
  competencyIds: text("competency_ids").array().notNull().default([]),
  nextAction: text("next_action").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
});

export const examSessionsTable = pgTable("exam_sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  exerciseIds: text("exercise_ids").array().notNull().default([]),
  durationMinutes: integer("duration_minutes").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { mode: "string" }),
  submittedAt: timestamp("submitted_at", { mode: "string" }),
  score: integer("score")
});

export const businessCasesTable = pgTable("business_cases", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  domain: text("domain").notNull(),
  level: integer("level").notNull(),
  status: text("status").notNull(),
  payloadJson: jsonb("payload_json").notNull().default({})
});

export const businessCaseAttemptsTable = pgTable("business_case_attempts", {
  id: text("id").primaryKey(),
  businessCaseId: text("business_case_id").notNull(),
  userMemo: text("user_memo").notNull(),
  score: integer("score").notNull(),
  correction: text("correction").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
});
