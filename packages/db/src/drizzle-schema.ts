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
  unique,
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
  // Typed evaluators can award fractional marks; the database must preserve the
  // same score the correction panel and its JSON payload show.
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
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
  score: numeric("score", { precision: 5, scale: 2 }).notNull(),
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
  estimatedMinutes: integer("estimated_minutes").notNull().default(0),
  publicationStatus: text("publication_status").notNull().default("published")
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
  sourceRef: text("source_ref"),
  exerciseVersionId: text("exercise_version_id"),
  sourceType: text("source_type"),
  sourceEventId: text("source_event_id"),
  correctedAt: timestamp("corrected_at", { mode: "string" })
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

// --- Active review --------------------------------------------------------
//
// Owned learner state, like `flashcard_states`. What is scheduled stays in the
// shared catalogue; only the schedule is personal.
//
// `itemType` + `itemRef` is a two-catalogue reference — a flashcard id or an
// exercise id — which is why there is no `references()` here and none in
// migration 0007 either. It is what lets the queue carry an exercise to retest
// alongside the cards, and it is resolved by `review-repository.ts`.

export const reviewQueueTable = pgTable(
  "review_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    itemType: text("item_type").notNull(),
    itemRef: text("item_ref").notNull(),
    competencyId: text("competency_id"),
    dueAt: timestamp("due_at", { mode: "string" }).notNull(),
    intervalDays: integer("interval_days").notNull().default(0),
    lastRating: text("last_rating"),
    lastReviewedAt: timestamp("last_reviewed_at", { mode: "string" }),
    reviewCount: integer("review_count").notNull().default(0),
    lapseCount: integer("lapse_count").notNull().default(0),
    source: text("source").notNull().default("catalogue"),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow()
  },
  (table) => [unique().on(table.userId, table.itemType, table.itemRef)]
);

// Append-only. `review_queue` holds the current state; this holds how it got
// there, including whether the answer was revealed before the self-assessment.
export const reviewAttemptsTable = pgTable("review_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  queueItemId: uuid("queue_item_id").notNull(),
  itemType: text("item_type").notNull(),
  itemRef: text("item_ref").notNull(),
  rating: text("rating").notNull(),
  revealed: boolean("revealed").notNull(),
  intervalDays: integer("interval_days").notNull(),
  previousDueAt: timestamp("previous_due_at", { mode: "string" }).notNull(),
  nextDueAt: timestamp("next_due_at", { mode: "string" }).notNull(),
  reviewedAt: timestamp("reviewed_at", { mode: "string" }).notNull().defaultNow()
});

// The partial unique index of migration 0007 — one open task per item per user
// — cannot be expressed here, so `review-repository.ts` checks for an existing
// open task before inserting and the index stays the backstop.
export const remediationTasksTable = pgTable("remediation_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  queueItemId: uuid("queue_item_id"),
  reviewAttemptId: uuid("review_attempt_id"),
  itemType: text("item_type").notNull(),
  itemRef: text("item_ref").notNull(),
  competencyId: text("competency_id"),
  reason: text("reason").notNull(),
  microLesson: text("micro_lesson").notNull(),
  nextAction: text("next_action").notNull(),
  exerciseId: text("exercise_id"),
  status: text("status").notNull().default("open"),
  dueAt: timestamp("due_at", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { mode: "string" })
});

// --- Excel lab drafts (PR-12b) --------------------------------------------
//
// One saved grid per (user, exercise): the raw inputs as typed, formulas
// included. A draft, never an attempt — grading only ever reads `attempts` —
// so losing this table costs work in progress, not marks.
export const labWorkbooksTable = pgTable(
  "lab_workbooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    cellsJson: jsonb("cells").notNull().default({}),
    createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
  },
  (table) => [unique().on(table.userId, table.exerciseId)]
);

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

// --- Billing --------------------------------------------------------------
//
// Mirrors migration 0009. Two of these five tables carry no row level security
// — `billing_customers` and `billing_events` — because a Stripe webhook must
// resolve a customer id into a user *before* any user context can be bound. The
// three that describe a person are owned and policed like everything else.

// The identity bridge. `userId` is the primary key, so one learner has at most
// one Stripe customer; `stripeCustomerId` is unique, so one Stripe customer
// cannot be pointed at two learners.
export const billingCustomersTable = pgTable("billing_customers", {
  userId: uuid("user_id").primaryKey(),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
});

// The at-least-once delivery ledger. The handler claims an id here before doing
// any work, so a Stripe retry cannot re-apply a grant a later event revoked.
export const billingEventsTable = pgTable("billing_events", {
  stripeEventId: text("stripe_event_id").primaryKey(),
  type: text("type").notNull(),
  outcome: text("outcome").notNull().default("received"),
  detail: text("detail").notNull().default(""),
  receivedAt: timestamp("received_at", { mode: "string" }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { mode: "string" })
});

// A local mirror of Stripe, never the source of truth. `status` is unconstrained
// text: a status the API adds later must land here verbatim rather than be
// coerced, and which ones grant access is decided in @finance/domain.
export const subscriptionsTable = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  status: text("status").notNull(),
  planKey: text("plan_key"),
  priceId: text("price_id"),
  currentPeriodEnd: timestamp("current_period_end", { mode: "string" }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  // `event.created` of the newest event applied here. Guards against Stripe
  // redelivering a stale event after a newer one — see migration 0009.
  lastEventAt: timestamp("last_event_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
});

// One row per feature per learner, updated in place. `expiresAt` null means
// "until revoked", which is what a provisional checkout grant looks like before
// the subscription event supplies a period end.
export const entitlementsTable = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    feature: text("feature").notNull(),
    status: text("status").notNull().default("active"),
    source: text("source").notNull().default("subscription"),
    planKey: text("plan_key"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    grantedAt: timestamp("granted_at", { mode: "string" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { mode: "string" }),
    revokedAt: timestamp("revoked_at", { mode: "string" }),
    updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
  },
  (table) => [unique().on(table.userId, table.feature)]
);

// Issued once per track per learner. The holder's email is denormalised so a
// later account change cannot reprint a document under a different name.
export const certificatesTable = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    serial: text("serial").notNull().unique(),
    trackId: text("track_id").notNull(),
    trackLabel: text("track_label").notNull(),
    holderEmail: text("holder_email").notNull(),
    curriculumVersionId: text("curriculum_version_id").notNull(),
    levelCount: integer("level_count").notNull(),
    averageScore: integer("average_score").notNull(),
    issuedAt: timestamp("issued_at", { mode: "string" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { mode: "string" }),
    revokedReason: text("revoked_reason"),
    // PR-13.
    verificationId: text("verification_id"),
    holderLabel: text("holder_label").notNull().default(""),
    contentJson: jsonb("content_json").notNull().default({}),
    status: text("status").notNull().default("active"),
    revokedBy: text("revoked_by"),
    supersededBySerial: text("superseded_by_serial")
  }
  // The 0009 `UNIQUE (user_id, track_id)` is dropped by migration 0012 and
  // replaced with a partial unique index over the *active* rows only, which
  // drizzle cannot express — re-issue needs a second row for the same pair.
);

/**
 * The public projection of an issued certificate (PR-13).
 *
 * It exists so `/verify/[id]` never touches `certificates`: the e-mail, the
 * user id, the score and the revocation reason are simply not columns here, so
 * no query written against this table can disclose them. No row level security,
 * for the reason `billing_customers` has none — the row is meant to be readable
 * by whoever holds the opaque id, and that id is the access control.
 */
export const certificateVerificationsTable = pgTable("certificate_verifications", {
  verificationId: text("verification_id").primaryKey(),
  serial: text("serial").notNull().unique(),
  holderLabel: text("holder_label").notNull(),
  trackLabel: text("track_label").notNull(),
  curriculumVersionId: text("curriculum_version_id").notNull(),
  issuedAt: timestamp("issued_at", { mode: "string" }).notNull(),
  status: text("status").notNull().default("active"),
  revokedAt: timestamp("revoked_at", { mode: "string" }),
  supersededBySerial: text("superseded_by_serial"),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
});

/**
 * Why an attestation was withdrawn, and by whom. Internal: the public
 * projection above deliberately has no reason column, because a stranger with
 * the QR code has no business reading it.
 */
export const certificateRevocationsTable = pgTable("certificate_revocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  serial: text("serial").notNull(),
  reason: text("reason").notNull(),
  revokedBy: text("revoked_by").notNull(),
  revokedAt: timestamp("revoked_at", { mode: "string" }).notNull().defaultNow()
});

// --- Content factory drafts (PR-14) ---------------------------------------
//
// Mirrors migration 0013. No `user_id` and no row level security: a draft is
// shared administration content with no owner to police, and it carries nothing
// personal for a policy to protect — the access control is `requireAdmin` on the
// routes, plus the absence of any learner datum in these columns.
//
// Three things drizzle cannot express here, all enforced by migration 0013:
//   * the CHECK on `contentType`, mirroring `contentTypes` in
//     packages/content-generation/src/types/artifact.ts;
//   * the CHECK on `status`, mirroring `contentDraftStatuses` — which has no
//     `published` value, deliberately, so a draft cannot be marked public by any
//     write at all;
//   * the CHECKs bounding `difficulty` to 1–5 and `revision` to 1 or more, and
//     the indexes on `(chapter_slug, status)` and `(status, updated_at)`.
//
// The four JSONB columns are deliberately untyped here, like `specJson` on
// `exercise_versions`: their shapes belong to the Zod schemas of
// packages/content-generation, and `content-draft-repository.ts` is the boundary
// that hands them over to be validated. Restating those shapes in this package
// would only create a second copy to drift.

export const contentDraftsTable = pgTable("content_drafts", {
  // Deterministic, `draft-<hex>`: regenerating the same chapter from the same
  // sources addresses the same row rather than forking a copy of it.
  id: text("id").primaryKey(),
  contentType: text("content_type").notNull(),
  status: text("status").notNull(),
  chapterSlug: text("chapter_slug").notNull(),
  chapterLabel: text("chapter_label").notNull(),
  domain: text("domain").notNull(),
  title: text("title").notNull(),
  difficulty: integer("difficulty").notNull(),
  payload: jsonb("payload").notNull(),
  generationMetadata: jsonb("generation_metadata").notNull(),
  // Nullable on purpose: "not checked yet" is not "checked, nothing to report".
  validationMetadata: jsonb("validation_metadata"),
  reviewMetadata: jsonb("review_metadata").notNull().default({}),
  sourcePackId: text("source_pack_id").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow()
});

// Append-only: `content_drafts` holds what a draft is now, this holds how it got
// there. Separate from the draft because a draft is rewritten on every
// regeneration and the record of who approved what must survive that.
//
// `draftId` carries no `references()` here — the same convention as
// `certificate_revocations` — but the foreign key and its ON DELETE CASCADE are
// real, and declared in migration 0013. `fromStatus` is null on the first
// transition: a freshly generated draft comes from nowhere.
export const contentDraftTransitionsTable = pgTable("content_draft_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  draftId: text("draft_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actor: text("actor").notNull(),
  comment: text("comment"),
  occurredAt: timestamp("occurred_at", { mode: "string" }).notNull().defaultNow()
});

// --- PR-15: publication ----------------------------------------------------
//
// The published snapshots themselves live in `content/published/`, a committed
// directory the public site reads without a database. These tables are the
// registry of publication *acts* on an install that persists: which version is
// current, who made it so, and in place of what. See migration 0014.

export const publishedContentVersionsTable = pgTable("published_content_versions", {
  id: text("id").primaryKey(),
  // Traceability only, and deliberately not a foreign key: published course
  // material must outlive the draft that produced it.
  sourceArtifactId: text("source_artifact_id").notNull(),
  artifactType: text("artifact_type").notNull(),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  domain: text("domain").notNull(),
  module: text("module").notNull(),
  chapter: text("chapter").notNull(),
  chapterLabel: text("chapter_label").notNull(),
  contentSnapshot: jsonb("content_snapshot").notNull(),
  sourceReferencesSnapshot: jsonb("source_references_snapshot").notNull(),
  publicationVersion: integer("publication_version").notNull(),
  publishedAt: timestamp("published_at", { mode: "string" }).notNull().defaultNow(),
  publishedBy: text("published_by").notNull(),
  generationMetadataSnapshot: jsonb("generation_metadata_snapshot").notNull(),
  validationMetadataSnapshot: jsonb("validation_metadata_snapshot").notNull(),
  reviewMetadataSnapshot: jsonb("review_metadata_snapshot").notNull(),
  contentHash: text("content_hash").notNull(),
  status: text("status").notNull().default("published"),
  previousPublishedVersionId: text("previous_published_version_id"),
  archivedAt: timestamp("archived_at", { mode: "string" })
});

// Append-only, and — unlike the draft trail — it does not cascade: it records
// that material was made public, which stays true after the version row is gone.
export const contentPublicationAuditTable = pgTable("content_publication_audit", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: text("action").notNull(),
  versionId: text("version_id").notNull(),
  previousVersionId: text("previous_version_id"),
  artifactType: text("artifact_type").notNull(),
  chapter: text("chapter").notNull(),
  slug: text("slug").notNull(),
  publicationVersion: integer("publication_version").notNull(),
  actor: text("actor").notNull(),
  comment: text("comment"),
  contentHash: text("content_hash").notNull(),
  occurredAt: timestamp("occurred_at", { mode: "string" }).notNull().defaultNow()
});

// The one personal table of this lot: the evidence a chapter's progression is
// computed from. Under RLS, and listed in `userOwnedTables`.
export const chapterActivityEventsTable = pgTable("chapter_activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  module: text("module").notNull(),
  chapter: text("chapter").notNull(),
  kind: text("kind").notNull(),
  artifactId: text("artifact_id").notNull(),
  succeeded: boolean("succeeded").notNull(),
  // Null for a consultation; 0–20 for a graded activity.
  score: numeric("score", { precision: 5, scale: 2 }),
  occurredAt: timestamp("occurred_at", { mode: "string" }).notNull().defaultNow()
});
