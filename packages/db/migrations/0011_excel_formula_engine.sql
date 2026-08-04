-- PR-12b: admit `spreadsheet_formula` as an evaluation type, and give the
-- learner's grid a place to be saved.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly — the DROP-then-ADD pair for the CHECK (as in 0008),
-- `IF NOT EXISTS` on the table and index, `DROP POLICY IF EXISTS` before each
-- CREATE POLICY (as in 0007).

-- ---------------------------------------------------------------------------
-- 1. The evaluation-type CHECK, widened
-- ---------------------------------------------------------------------------

ALTER TABLE exercise_versions
  DROP CONSTRAINT IF EXISTS exercise_versions_evaluation_type_check;

ALTER TABLE exercise_versions
  ADD CONSTRAINT exercise_versions_evaluation_type_check
  -- Mirrors EVALUATION_TYPES in packages/domain/src/evaluators/types.ts.
  -- `spreadsheet_formula` is the PR-12b engine-backed evaluator: the learner's
  -- formula is parsed and recalculated over given and perturbed data, instead
  -- of being matched against an authored text pattern.
  CHECK (evaluation_type IN (
    'multiple_choice',
    'numeric',
    'journal_entry',
    'short_text_rubric',
    'spreadsheet',
    'spreadsheet_formula',
    'legacy_rubric'
  ));

-- ---------------------------------------------------------------------------
-- 2. Saved workbooks
-- ---------------------------------------------------------------------------
--
-- One row per (user, exercise): the raw cell inputs of the learner's grid, as
-- typed — formulas as text, values as JSON numbers — so reopening an exercise
-- restores the work in progress. This is a draft, not an attempt: grading
-- reads `attempts`, never this table, and nothing here is ever authoritative
-- about a score. Saving is available only when the database is active; in
-- seeded mode the grid simply starts empty, which is the same behaviour the
-- lab always had.

CREATE TABLE IF NOT EXISTS lab_workbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  -- No foreign key: exercises live in the seeded catalogue as well as in the
  -- database, and a draft must not be deleted because content moved between
  -- the two. The application validates the id against the catalogue on read.
  exercise_id TEXT NOT NULL,
  -- Raw inputs keyed by A1 reference, e.g. {"B12": "=SOMME(B2:B10)"}. Bounded
  -- by the application (same 40-cell cap as a submission); JSONB so a future
  -- format change is data, not DDL.
  cells JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One draft per exercise per learner: saving again replaces, it never forks.
  UNIQUE (user_id, exercise_id)
);

CREATE INDEX IF NOT EXISTS lab_workbooks_user_idx ON lab_workbooks (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------
--
-- Same discipline as 0002/0003/0007: ENABLE then FORCE, because without FORCE
-- the table owner bypasses every policy and the isolation is an illusion.

DO $$
DECLARE
  target TEXT;
  owned_tables TEXT[] := ARRAY[
    'lab_workbooks'
  ];
BEGIN
  FOREACH target IN ARRAY owned_tables LOOP
    IF to_regclass(target) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_select_own', target);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (user_id = app_current_user_id())',
      target || '_select_own', target
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_insert_own', target);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (user_id = app_current_user_id())',
      target || '_insert_own', target
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_update_own', target);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id())',
      target || '_update_own', target
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', target || '_delete_own', target);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (user_id = app_current_user_id())',
      target || '_delete_own', target
    );
  END LOOP;
END;
$$;
