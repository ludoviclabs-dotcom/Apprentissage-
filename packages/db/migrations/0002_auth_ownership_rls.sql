-- PR-01: local-first authentication, per-user ownership and row level security.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly. PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, hence
-- the `DROP POLICY IF EXISTS` before each `CREATE POLICY`.

-- ---------------------------------------------------------------------------
-- 1. Identity
-- ---------------------------------------------------------------------------

-- gen_random_uuid() is built into PostgreSQL 13+; no pgcrypto needed.
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  -- lower(trim(email)); the uniqueness constraint lives here so that
  -- "Ludo@Example.com " and "ludo@example.com" cannot both be registered.
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opaque, revocable sessions. Only the SHA-256 digest of the cookie token is
-- stored, so database read access cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  locale TEXT NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Current-user accessor
-- ---------------------------------------------------------------------------

-- The local equivalent of Supabase's auth.uid(). The application sets
-- `app.current_user_id` with SET LOCAL inside a transaction; policies read it
-- through this function.
--
-- It must NEVER raise: an unset or malformed setting returns NULL, and every
-- policy below compares against it, so the default outcome is "deny".
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw TEXT;
BEGIN
  raw := NULLIF(current_setting('app.current_user_id', true), '');

  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN raw::uuid;
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ownership columns on existing user-data tables
-- ---------------------------------------------------------------------------
--
-- Deliberately nullable: rows created before authentication existed have no
-- owner. Under the policies below a NULL owner matches nobody, so legacy rows
-- become invisible rather than shared. Re-seed after migrating.

ALTER TABLE IF EXISTS attempts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS corrections
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS revision_items
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS revision_reviews
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS error_journal
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;
ALTER TABLE IF EXISTS business_case_attempts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS attempts_user_id_idx ON attempts (user_id);
CREATE INDEX IF NOT EXISTS corrections_user_id_idx ON corrections (user_id);
CREATE INDEX IF NOT EXISTS revision_items_user_id_idx ON revision_items (user_id);
CREATE INDEX IF NOT EXISTS revision_reviews_user_id_idx ON revision_reviews (user_id);
CREATE INDEX IF NOT EXISTS error_journal_user_id_idx ON error_journal (user_id);
CREATE INDEX IF NOT EXISTS business_case_attempts_user_id_idx ON business_case_attempts (user_id);

-- `exam_sessions` deliberately does NOT get a user_id or RLS. It is written by
-- `seed.ts` as the catalogue of exam TEMPLATES, and `startExam` was inserting
-- live per-user runs into the same table — which is also why /annales-concours
-- accumulated duplicate "in-progress" rows. Templates stay global and readable;
-- runs move to their own owned table.
CREATE TABLE IF NOT EXISTS exam_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  exam_session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('in-progress', 'submitted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  score INTEGER CHECK (score IS NULL OR score BETWEEN 0 AND 20),
  answers_json JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS exam_runs_user_id_idx ON exam_runs (user_id);

-- One live run per user per exam: what made duplicates possible before.
CREATE UNIQUE INDEX IF NOT EXISTS exam_runs_one_active_per_exam
  ON exam_runs (user_id, exam_session_id)
  WHERE status = 'in-progress';

-- ---------------------------------------------------------------------------
-- 4. Per-user progress that used to live on shared catalog tables
-- ---------------------------------------------------------------------------
--
-- `competencies.strength`, `flashcards.status/due_at/interval_days` and
-- `learning_paths.current_day` are single-user progress stored on rows that are
-- otherwise a shared catalogue. With more than one account they would silently
-- overwrite each other. Progress moves here; the catalogue columns stay as the
-- seeded starting point.

CREATE TABLE IF NOT EXISTS competency_progress (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  competency_id TEXT NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  strength INTEGER NOT NULL CHECK (strength BETWEEN 0 AND 100),
  status TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, competency_id)
);

CREATE TABLE IF NOT EXISTS flashcard_states (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  flashcard_id TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('new', 'learning', 'due', 'mastered')),
  due_at TIMESTAMPTZ NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, flashcard_id)
);

CREATE INDEX IF NOT EXISTS flashcard_states_due_idx ON flashcard_states (user_id, due_at);

-- ---------------------------------------------------------------------------
-- 5. Row level security
-- ---------------------------------------------------------------------------
--
-- FORCE is what makes this real: without it the table owner — which is the role
-- the application connects as — silently bypasses every policy.
--
-- app_users and user_sessions are intentionally NOT covered: the login flow has
-- to read them before any user context exists. Unlike a Supabase deployment,
-- nothing outside this application ever connects to this database, so those two
-- tables are protected by never being exposed through a route handler. See
-- docs/adr/001-local-auth-rls.md.

DO $$
DECLARE
  target TEXT;
  owned_tables TEXT[] := ARRAY[
    'profiles',
    'attempts',
    'corrections',
    'revision_items',
    'revision_reviews',
    'error_journal',
    'exam_runs',
    'business_case_attempts',
    'competency_progress',
    'flashcard_states'
  ];
BEGIN
  FOREACH target IN ARRAY owned_tables LOOP
    IF to_regclass(target) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target);

    -- profiles keys on user_id as its primary key; every other table carries a
    -- user_id column. The predicate is identical in both cases.
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

    -- USING filters the rows that may be updated; WITH CHECK stops an update
    -- from reassigning a row to somebody else.
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

-- ---------------------------------------------------------------------------
-- 6. Housekeeping
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION delete_expired_sessions() RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  removed INTEGER;
BEGIN
  DELETE FROM user_sessions WHERE expires_at <= now();
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;
