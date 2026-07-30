-- PR-02: versioned curriculum, mastery events and monotonic level unlocking.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly. PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, hence
-- the `DROP POLICY IF EXISTS` before each `CREATE POLICY`, exactly as in 0002.
--
-- GLOBAL vs OWNED. `curriculum_versions` and `module_levels` are the published
-- catalogue: one shared, versioned statement of what there is to learn, written
-- by `seed.ts` and readable with no user bound — the same treatment `exercises`
-- and `exam_sessions` already get. They carry neither `user_id` nor RLS.
-- Everything a learner *produces* — the enrolment, graded events, the computed
-- snapshot, the unlock — is owned, indexed on `user_id` and isolated by policy.
-- Splitting them is what lets two accounts share a curriculum without sharing a
-- single byte of progress, the bug class 0002 fixed for `competencies.strength`.
--
-- WHY THE ENROLMENT PINS A VERSION. `enrollments.curriculum_version_id` is
-- written once per (user, track) and never moved. Publishing new thresholds
-- therefore cannot re-grade somebody mid-track: they keep being evaluated
-- against the rules they started under. That is also why the reference to
-- `curriculum_versions` does NOT cascade — dropping a version somebody is
-- enrolled against must fail loudly rather than silently unpin them.
--
-- WHY ACQUISITION IS MONOTONIC. `mastery_snapshots` caches a pure function of
-- (events, competency strengths, rules, acquired ids), so any row is always
-- safe to throw away and recompute; it is keyed on (user_id, level_id) and
-- upsert-replaceable. `unlock_events` is its opposite: the durable record that a
-- level was once cleared, appended and never rewritten. `UNIQUE (user_id,
-- level_id)` makes recording an unlock idempotent, and because the evaluator
-- reads that row back as `alreadyAcquired`, a later dip in scores — a failed
-- retention quiz, a rule change, a re-seed — cannot re-lock a level the learner
-- already earned. Progress is a ratchet, not a running average.

-- ---------------------------------------------------------------------------
-- 1. Global curriculum catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS curriculum_versions (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  -- Informational only. Version selection is by id, never by comparing dates,
  -- so two versions may legitimately share an effective date.
  effective_from DATE NOT NULL,
  rules_json JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_levels (
  id TEXT PRIMARY KEY,
  curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1),
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  competency_ids TEXT[] NOT NULL DEFAULT '{}',
  -- Subset of competency_ids that must each clear the minimum on their own, so a
  -- level cannot be passed by compensating a weak essential with strong optionals.
  critical_competency_ids TEXT[] NOT NULL DEFAULT '{}',
  estimated_minutes INTEGER NOT NULL DEFAULT 0,
  -- One level per position per track: a duplicated position would make the
  -- gating order ambiguous, and a level nobody can reach is unfinishable.
  UNIQUE (curriculum_version_id, track_id, level)
);

CREATE INDEX IF NOT EXISTS module_levels_track_idx
  ON module_levels (curriculum_version_id, track_id, level);

-- ---------------------------------------------------------------------------
-- 2. Owned learner state
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  curriculum_version_id TEXT NOT NULL REFERENCES curriculum_versions(id),
  track_id TEXT NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, track_id)
);

CREATE TABLE IF NOT EXISTS mastery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES module_levels(id) ON DELETE CASCADE,
  -- Mirrors ACTIVITY_KINDS + "finalDiagnostic" in packages/domain/src/mastery.ts.
  -- The four activity kinds are weighted; finalDiagnostic is a gate, not a weight.
  kind TEXT NOT NULL CHECK (kind IN ('direct', 'retention', 'caseStudy', 'explanation', 'finalDiagnostic')),
  score_percent NUMERIC(5, 2) NOT NULL CHECK (score_percent BETWEEN 0 AND 100),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Free-form provenance (attempt id, exam run id, flashcard id) so a score can
  -- be traced back to the work that produced it.
  source_ref TEXT
);

-- Scoring reduces a learner's events for one level in occurrence order
-- ("latest wins"), which is exactly this index.
CREATE INDEX IF NOT EXISTS mastery_events_user_level_idx
  ON mastery_events (user_id, level_id, occurred_at);

CREATE TABLE IF NOT EXISTS mastery_snapshots (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES module_levels(id) ON DELETE CASCADE,
  -- Which rules produced this row. Stored, not inferred, so a snapshot computed
  -- under older thresholds is recognisable instead of silently misread.
  rules_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('locked', 'available', 'in-progress', 'acquired')),
  score NUMERIC(5, 2) NOT NULL,
  detail_json JSONB NOT NULL DEFAULT '{}',
  blockers_json JSONB NOT NULL DEFAULT '[]',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, level_id)
);

CREATE TABLE IF NOT EXISTS unlock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES module_levels(id) ON DELETE CASCADE,
  rules_version TEXT NOT NULL,
  score NUMERIC(5, 2) NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Append-once. Makes recording an unlock idempotent and acquisition monotonic.
  UNIQUE (user_id, level_id)
);

-- No separate `user_id` index on the four owned tables above: the UNIQUE
-- constraints and the primary key all lead with `user_id`, so the policy
-- predicate is already served.

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------
--
-- Same discipline as 0002: ENABLE then FORCE, because without FORCE the table
-- owner — the role the application connects as — bypasses every policy and the
-- isolation is an illusion. USING filters what may be read/updated/deleted,
-- WITH CHECK stops a write from assigning a row to somebody else.

DO $$
DECLARE
  target TEXT;
  owned_tables TEXT[] := ARRAY[
    'enrollments',
    'mastery_events',
    'mastery_snapshots',
    'unlock_events'
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
