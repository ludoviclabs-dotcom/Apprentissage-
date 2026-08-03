// `migrate.ts` replays this list in order on every run, so each file must be
// written to be idempotent. Appending here is the only way a migration ships.
export const migrationFiles = [
  "migrations/0001_init.sql",
  "migrations/0002_auth_ownership_rls.sql",
  "migrations/0003_mastery_unlocks.sql",
  "migrations/0004_application_role.sql",
  // After the role grant on purpose: 0004 ends with ALTER DEFAULT PRIVILEGES, so
  // tables created from here on are reachable by `finance_app` without the
  // migration having to re-grant them.
  "migrations/0005_exercise_versions.sql",
  "migrations/0006_attempt_evaluation_provenance.sql",
  "migrations/0007_review_queue_remediation.sql",
  "migrations/0008_spreadsheet_evaluation_type.sql",
  "migrations/0009_billing_entitlements.sql",
  "migrations/0010_canonical_learning_progression.sql",
  "migrations/0011_excel_formula_engine.sql"
] as const;

/** Tables protected by row level security, keyed on `user_id`. */
export const userOwnedTables = [
  "profiles",
  "attempts",
  "corrections",
  "revision_items",
  "revision_reviews",
  "error_journal",
  "exam_runs",
  "business_case_attempts",
  "competency_progress",
  "flashcard_states",
  "enrollments",
  "mastery_events",
  "mastery_snapshots",
  "unlock_events",
  "review_queue",
  "review_attempts",
  "remediation_tasks",
  // Billing. `billing_customers` and `billing_events` are deliberately absent:
  // a webhook resolves a Stripe customer id into a user before any user context
  // exists, so those two carry no policy — see migration 0009.
  "subscriptions",
  "entitlements",
  "certificates",
  // PR-12b: the learner's saved grid drafts — the most ordinary owned data.
  "lab_workbooks"
] as const;

export type UserOwnedTable = (typeof userOwnedTables)[number];

export const tables = [
  "source_packs",
  "documents",
  "document_pages",
  "chunks",
  "embeddings",
  "concepts",
  "chunk_concepts",
  "competencies",
  "learning_paths",
  "lessons",
  "lesson_sources",
  "learning_days",
  "exercises",
  "attempts",
  "corrections",
  "simulations",
  "revision_items",
  "modules",
  "flashcards",
  "revision_reviews",
  "error_journal",
  "exam_sessions",
  "business_cases",
  "business_case_attempts",
  "app_users",
  "user_sessions",
  "profiles",
  "exam_runs",
  "competency_progress",
  "flashcard_states",
  "curriculum_versions",
  "module_levels",
  "enrollments",
  "mastery_events",
  "mastery_snapshots",
  "unlock_events",
  // Authored content, like `exercises`: global, un-RLS'd, and therefore absent
  // from `userOwnedTables` above.
  "exercise_versions",
  "exercise_criteria",
  "exercise_test_cases",
  // Active review: the schedule, its history and the work a failure earns. All
  // owned, hence also present in `userOwnedTables` above.
  "review_queue",
  "review_attempts",
  "remediation_tasks",
  // Billing: the Stripe identity map and the webhook ledger, then the three
  // owned tables that describe what a learner bought, may open, and earned.
  "billing_customers",
  "billing_events",
  "subscriptions",
  "entitlements",
  "certificates",
  // Excel lab drafts (PR-12b): owned, hence also in `userOwnedTables` above.
  "lab_workbooks"
] as const;

export type TableName = (typeof tables)[number];

export interface DbHealth {
  engine: "postgres";
  extension: "pgvector";
  migrationCount: number;
  tableCount: number;
}

export function getDbHealth(): DbHealth {
  return {
    engine: "postgres",
    extension: "pgvector",
    migrationCount: migrationFiles.length,
    tableCount: tables.length
  };
}
