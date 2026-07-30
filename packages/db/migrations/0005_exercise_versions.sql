-- PR-03: versioned exercise specifications for the typed evaluator engine.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly — hence `IF NOT EXISTS` on every table, index and
-- column. There is no `DROP POLICY IF EXISTS` preamble in this file only because
-- it creates no policies; see the next paragraph.
--
-- WHY THESE THREE TABLES ARE GLOBAL AND CARRY NO RLS. They are authored content,
-- not learner state: the same treatment `exercises`, `module_levels` and
-- `curriculum_versions` already get. A specification is written once by the
-- author and read identically by every account, so there is no `user_id` to
-- filter on and a policy keyed on one would have nothing to say. Row level
-- security exists here to stop one learner reading another's work; adding it to
-- a shared catalogue would only make the catalogue invisible to everybody. What
-- a learner *produces* against these rows — the attempt, the correction — is
-- owned and stays isolated by the policies migration 0002 already installed.
--
-- WHY VERSIONS RATHER THAN COLUMNS ON `exercises`. `exercises.rubric_json` is a
-- list of `{ label, points }`, which carries no machine-checkable expectation:
-- the previous grader matched words lifted from the criterion's own label. The
-- typed evaluators of `packages/domain/src/evaluators` each own a specification
-- format instead, and `evaluation_type` names which one grades this row.
-- Versioning that specification — rather than editing it in place — is what lets
-- a stored attempt stay interpretable: `attempts.exercise_version_id` pins the
-- exact spec that produced a mark, so republishing an exercise cannot silently
-- re-grade work already done under the old one. The partial unique index keeps
-- exactly one version live per exercise, so "which spec does a new submission
-- get" never depends on ordering or on a max() that ties.
--
-- WHY `exercise_test_cases` EXISTS. An author ships the expected behaviour of
-- their own exercise alongside its specification: a handful of submissions with
-- the mark each must receive. Grading is pure — same spec, same answer, same
-- result — so those rows are executable. A spec change that breaks grading then
-- fails a test at authoring time instead of silently re-marking learners, which
-- is the failure mode this whole vertical exists to remove: nobody notices a
-- rubric regression by looking at scores, because a wrong score looks exactly
-- like a wrong answer.

-- ---------------------------------------------------------------------------
-- 1. Versioned specifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exercise_versions (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  -- Mirrors EVALUATION_TYPES in packages/domain/src/evaluators/types.ts.
  -- `legacy_rubric` is accepted so already-authored exercises keep grading
  -- through the previous rubric matcher while they are migrated; it has no
  -- entry in the evaluator registry, so nothing new can be authored against it.
  evaluation_type TEXT NOT NULL CHECK (evaluation_type IN (
    'multiple_choice',
    'numeric',
    'journal_entry',
    'short_text_rubric',
    'legacy_rubric'
  )),
  -- Shape is owned by the evaluator named in `evaluation_type`, so it is
  -- validated by the domain rather than by a column constraint.
  spec_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Version numbers are the author's handle on history: reusing one would make
  -- "graded under v2" ambiguous.
  UNIQUE (exercise_id, version)
);

-- At most one live version per exercise. A partial unique index rather than a
-- CHECK because the invariant spans rows: two active versions would make the
-- spec a new submission is graded against depend on row order.
CREATE UNIQUE INDEX IF NOT EXISTS exercise_versions_one_active
  ON exercise_versions (exercise_id)
  WHERE is_active;

CREATE TABLE IF NOT EXISTS exercise_criteria (
  id TEXT PRIMARY KEY,
  exercise_version_id TEXT NOT NULL REFERENCES exercise_versions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  label TEXT NOT NULL,
  -- NUMERIC, not INTEGER: half credit is awarded on partial matches, and the
  -- evaluators rescale the criteria total onto the 0–20 marking scale, so
  -- weights need not be whole. Zero or negative would contribute nothing to
  -- that total while still appearing in the feedback as a criterion.
  points NUMERIC(6, 2) NOT NULL CHECK (points > 0),
  spec_json JSONB NOT NULL DEFAULT '{}',
  -- Criteria are shown and scored in a fixed order; a duplicated position would
  -- make that order ambiguous between two rows.
  UNIQUE (exercise_version_id, position)
);

CREATE TABLE IF NOT EXISTS exercise_test_cases (
  id TEXT PRIMARY KEY,
  exercise_version_id TEXT NOT NULL REFERENCES exercise_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  submission_json JSONB NOT NULL,
  -- Same 0–20 scale and the same two decimals the evaluators round to, so an
  -- expectation can be written exactly as the learner would see it.
  expected_score NUMERIC(5, 2) NOT NULL CHECK (expected_score BETWEEN 0 AND 20),
  -- Per-criterion outcomes when the author wants to pin more than the total: a
  -- spec change can preserve the mark while moving which criterion earned it.
  expected_outcomes_json JSONB NOT NULL DEFAULT '{}',
  -- The name is what a failure report identifies, so it must be unique within
  -- the version it describes.
  UNIQUE (exercise_version_id, name)
);

-- No extra indexes: every lookup this catalogue serves — versions of an
-- exercise, criteria of a version, test cases of a version — is served by a
-- UNIQUE constraint that already leads with the foreign key.

-- ---------------------------------------------------------------------------
-- 2. Attempts record which engine graded them
-- ---------------------------------------------------------------------------
--
-- Both columns are nullable: attempts predating this migration were graded by
-- the rubric matcher and have no version to point at. Backfilling them with a
-- guess would assert something untrue about how those marks were produced, and
-- NULL reads correctly as "graded before the engine existed".
--
-- `evaluation_type` is stored alongside the reference rather than only joined
-- for: it is the answer to "how was this marked" even if the version it points
-- at is later replaced. It carries no CHECK, unlike the column of the same name
-- on `exercise_versions` — PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`, so
-- a table constraint added here could not be replayed, and the value is written
-- from an already-validated `EvaluationResult` rather than by hand.
--
-- RLS on `attempts` is configured in 0002 and deliberately untouched here.
-- Adding a column does not change a policy, and re-running that configuration
-- from this file would fork the definition across two migrations.

ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS evaluation_type TEXT;

ALTER TABLE attempts
  ADD COLUMN IF NOT EXISTS exercise_version_id TEXT REFERENCES exercise_versions(id);
