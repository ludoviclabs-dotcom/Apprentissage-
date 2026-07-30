import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

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
  userId: uuid("user_id"),
  exerciseId: text("exercise_id").notNull(),
  userAnswer: text("user_answer").notNull(),
  score: integer("score").notNull(),
  correctionJson: jsonb("correction_json").notNull().default({}),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  // Which engine produced the mark. Nullable because attempts predating the
  // typed evaluators were graded by the rubric matcher and have no version.
  evaluationType: text("evaluation_type"),
  exerciseVersionId: text("exercise_version_id")
});

export const correctionsTable = pgTable("corrections", {
  id: text("id").primaryKey(),
  userId: uuid("user_id"),
  attemptId: text("attempt_id").notNull(),
  score: integer("score").notNull(),
  summary: text("summary").notNull(),
  correctJson: jsonb("correct_json").notNull().default([]),
  errorsJson: jsonb("errors_json").notNull().default([]),
  remediation: text("remediation").notNull()
});

export const revisionItemsTable = pgTable("revision_items", {
  id: text("id").primaryKey(),
  userId: uuid("user_id"),
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
  userId: uuid("user_id"),
  flashcardId: text("flashcard_id").notNull(),
  rating: text("rating").notNull(),
  reviewedAt: timestamp("reviewed_at", { mode: "string" }).notNull(),
  nextDueAt: timestamp("next_due_at", { mode: "string" }).notNull(),
  intervalDays: integer("interval_days").notNull()
});

export const errorJournalTable = pgTable("error_journal", {
  id: text("id").primaryKey(),
  userId: uuid("user_id"),
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
  userId: uuid("user_id"),
  businessCaseId: text("business_case_id").notNull(),
  userMemo: text("user_memo").notNull(),
  score: integer("score").notNull(),
  correction: text("correction").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
});

// --- Identity -------------------------------------------------------------
//
// `app_users` and `user_sessions` are the only tables without row level
// security: the login flow must read them before any user context exists.
// Nothing outside this application connects to the database, and no route
// handler exposes them. See docs/adr/001-local-auth-rls.md.

export const appUsersTable = pgTable("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
});

export const userSessionsTable = pgTable("user_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { mode: "string" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "string" }).notNull()
});

export const profilesTable = pgTable("profiles", {
  userId: uuid("user_id").primaryKey(),
  displayName: text("display_name").notNull().default(""),
  locale: text("locale").notNull().default("fr"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
});

// --- Per-user progress ----------------------------------------------------
//
// These replace mutations of the shared catalogue: `recordAttempt` used to
// UPDATE competencies.strength and `reviewFlashcard` used to UPDATE
// flashcards.status/due_at, so one account's work moved every other account's
// progress. The catalogue columns remain the seeded starting point.

export const examRunsTable = pgTable("exam_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  examSessionId: text("exam_session_id").notNull(),
  status: text("status").notNull(),
  startedAt: timestamp("started_at", { mode: "string" }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { mode: "string" }),
  score: integer("score"),
  answersJson: jsonb("answers_json").notNull().default([])
});

export const competencyProgressTable = pgTable(
  "competency_progress",
  {
    userId: uuid("user_id").notNull(),
    competencyId: text("competency_id").notNull(),
    strength: integer("strength").notNull(),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.userId, table.competencyId] })]
);

export const flashcardStatesTable = pgTable(
  "flashcard_states",
  {
    userId: uuid("user_id").notNull(),
    flashcardId: text("flashcard_id").notNull(),
    status: text("status").notNull(),
    dueAt: timestamp("due_at", { mode: "string" }).notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.userId, table.flashcardId] })]
);

// --- Curriculum catalogue -------------------------------------------------
//
// Global and versioned, like `exercises`: no `user_id`, no row level security,
// written by `seed.ts`. A learner is enrolled against a version, so publishing
// new thresholds never re-grades somebody already mid-track.

export const curriculumVersionsTable = pgTable("curriculum_versions", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  rulesJson: jsonb("rules_json").notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow()
});

export const moduleLevelsTable = pgTable("module_levels", {
  id: text("id").primaryKey(),
  curriculumVersionId: text("curriculum_version_id").notNull(),
  trackId: text("track_id").notNull(),
  moduleId: text("module_id").notNull(),
  domain: text("domain").notNull(),
  level: integer("level").notNull(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  competencyIds: text("competency_ids").array().notNull().default([]),
  criticalCompetencyIds: text("critical_competency_ids").array().notNull().default([]),
  estimatedMinutes: integer("estimated_minutes").notNull().default(0)
});

// --- Mastery and unlocking ------------------------------------------------
//
// Scores are NUMERIC(5,2) rather than INTEGER because a weighted level score is
// rounded to two decimals, and the postgres-js driver hands them back as strings
// — `mastery-repository.ts` is the boundary that converts.

export const enrollmentsTable = pgTable("enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  curriculumVersionId: text("curriculum_version_id").notNull(),
  trackId: text("track_id").notNull(),
  enrolledAt: timestamp("enrolled_at", { mode: "string" }).notNull().defaultNow()
});

export const masteryEventsTable = pgTable("mastery_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  levelId: text("level_id").notNull(),
  kind: text("kind").notNull(),
  scorePercent: numeric("score_percent", { precision: 5, scale: 2 }).notNull(),
  occurredAt: timestamp("occurred_at", { mode: "string" }).notNull().defaultNow(),
  sourceRef: text("source_ref")
});

// A cache of a pure function, hence keyed on (user_id, level_id) and always
// replaceable by an upsert.
export const masterySnapshotsTable = pgTable(
  "mastery_snapshots",
  {
    userId: uuid("user_id").notNull(),
    levelId: text("level_id").notNull(),
    rulesVersion: text("rules_version").notNull(),
    status: text("status").notNull(),
    score: numeric("score", { precision: 5, scale: 2 }).notNull(),
    detailJson: jsonb("detail_json").notNull().default({}),
    blockersJson: jsonb("blockers_json").notNull().default([]),
    computedAt: timestamp("computed_at", { mode: "string" }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.userId, table.levelId] })]
);

// Append-only. The UNIQUE (user_id, level_id) in migration 0003 is what makes
// acquisition idempotent and monotonic: a later dip in scores cannot re-lock a
// level that was once cleared.
export const unlockEventsTable = pgTable("unlock_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  levelId: text("level_id").notNull(),
  rulesVersion: text("rules_version").notNull(),
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
  occurredAt: timestamp("occurred_at", { mode: "string" }).notNull().defaultNow()
});

// --- Exercise specifications ----------------------------------------------
//
// Authored content, like `exercises`: no `user_id`, no row level security. A
// version pins the specification a mark was produced under, so republishing an
// exercise cannot re-grade work already done. The partial unique index of
// migration 0005 keeps exactly one `isActive` row per exercise.
//
// `specJson` is deliberately untyped here: its shape belongs to the evaluator
// named by `evaluationType`, and `exercise-repository.ts` is the boundary that
// hands it to the domain to validate.

export const exerciseVersionsTable = pgTable("exercise_versions", {
  id: text("id").primaryKey(),
  exerciseId: text("exercise_id").notNull(),
  version: integer("version").notNull(),
  evaluationType: text("evaluation_type").notNull(),
  specJson: jsonb("spec_json").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
});

// Points are NUMERIC because partial credit is awarded in halves and the
// evaluators rescale the criteria total onto the 0–20 scale; the postgres-js
// driver hands them back as strings, converted at the repository boundary.
export const exerciseCriteriaTable = pgTable("exercise_criteria", {
  id: text("id").primaryKey(),
  exerciseVersionId: text("exercise_version_id").notNull(),
  position: integer("position").notNull(),
  label: text("label").notNull(),
  points: numeric("points", { precision: 6, scale: 2 }).notNull(),
  specJson: jsonb("spec_json").notNull().default({})
});

// The author's own expectations for their exercise. Grading is pure, so these
// rows are executable: a spec change that breaks grading fails a test instead
// of silently re-marking learners.
export const exerciseTestCasesTable = pgTable("exercise_test_cases", {
  id: text("id").primaryKey(),
  exerciseVersionId: text("exercise_version_id").notNull(),
  name: text("name").notNull(),
  submissionJson: jsonb("submission_json").notNull(),
  expectedScore: numeric("expected_score", { precision: 5, scale: 2 }).notNull(),
  expectedOutcomesJson: jsonb("expected_outcomes_json").notNull().default({})
});
