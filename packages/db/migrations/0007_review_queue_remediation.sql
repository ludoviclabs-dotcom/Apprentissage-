-- PR-04: the active review queue, its attempt log and the remediation it earns.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly — hence `IF NOT EXISTS` on every table and index, and
-- the `DROP POLICY IF EXISTS` before each `CREATE POLICY`, exactly as in 0002
-- and 0003. PostgreSQL has no `CREATE POLICY IF NOT EXISTS`.
--
-- ALL THREE TABLES ARE OWNED. A schedule is the most personal thing this product
-- holds: it is a record of what somebody does not know yet. Every table carries
-- `user_id` and row level security, and none of them is ever written by
-- `seed.ts`. The *content* being scheduled stays where it already lives —
-- `flashcards` and `exercises` are the shared catalogue — so two accounts revise
-- the same material on completely separate schedules. This is the split that
-- migration 0002 introduced for `competencies.strength`, applied to review.
--
-- WHY A QUEUE ROW RATHER THAN COLUMNS ON `flashcards`. `flashcard_states` from
-- 0002 already tracks per-user card state, and `review_queue` deliberately does
-- not replace it. The difference is what they can point at: `flashcard_states`
-- is keyed on a flashcard id, while a queue entry is `(item_type, item_ref)` and
-- so can also schedule an *exercise* graded by the PR-03 evaluators. That is
-- what makes "retest the thing you got wrong" expressible at all. The flashcard
-- path writes both, so the card list and the queue never disagree.
--
-- WHY THE ATTEMPT LOG IS SEPARATE FROM THE QUEUE. `review_queue` holds the
-- current state — one row per item, updated in place. `review_attempts` is
-- append-only history. Collapsing them would make "how often did I forget this"
-- unanswerable, and `lapse_count` on the queue row is a cache of that history,
-- not the record of it. The log also carries `revealed`, which is the audit
-- trail for the rule that gives this feature its name: a self-assessment is only
-- meaningful if the answer was actually looked at first, and a rating recorded
-- without a reveal is visibly different from one recorded with it.
--
-- WHY REMEDIATION IS IDEMPOTENT BY INDEX. Failing the same item three evenings
-- running is the normal case, not the edge case, and three identical open tasks
-- would turn the remediation list into noise the learner learns to ignore. The
-- partial unique index below permits exactly one *open* task per item per user
-- while leaving the closed ones as history, so the constraint expresses "you are
-- already working on this" rather than "you may only ever fail this once".

-- ---------------------------------------------------------------------------
-- 1. The queue
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  -- Mirrors REVIEW_ITEM_TYPES in packages/domain/src/review-scheduler.ts.
  item_type TEXT NOT NULL CHECK (item_type IN ('flashcard', 'exercise')),
  -- No foreign key: `item_ref` points into one of two catalogues depending on
  -- `item_type`, which no single REFERENCES clause can express. The application
  -- resolves it, and an entry whose content has disappeared is filtered out on
  -- read rather than cascading a learner's history away.
  item_ref TEXT NOT NULL,
  -- The PR-02 competency this item feeds, when the content declares one.
  competency_id TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  interval_days INTEGER NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  -- Mirrors ReviewRating in packages/domain/src/types.ts.
  last_rating TEXT CHECK (last_rating IN ('forgotten', 'partial', 'correct', 'mastered')),
  last_reviewed_at TIMESTAMPTZ,
  review_count INTEGER NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  -- Times this item was rated `forgotten`. A cache of `review_attempts`, kept on
  -- the row so ordering a queue never has to aggregate the log.
  lapse_count INTEGER NOT NULL DEFAULT 0 CHECK (lapse_count >= 0),
  -- How the item got here: seeded catalogue, a graded attempt, or a remediation.
  source TEXT NOT NULL DEFAULT 'catalogue' CHECK (source IN ('catalogue', 'attempt', 'remediation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One schedule per item per learner. This is what makes enqueueing idempotent:
  -- answering the same exercise twice moves the existing due date instead of
  -- creating a second entry that would surface the item twice in one session.
  UNIQUE (user_id, item_type, item_ref)
);

-- The one query the review page runs: this learner's items, oldest due first.
CREATE INDEX IF NOT EXISTS review_queue_due_idx ON review_queue (user_id, due_at);

-- ---------------------------------------------------------------------------
-- 2. The attempt log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS review_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  queue_item_id UUID NOT NULL REFERENCES review_queue(id) ON DELETE CASCADE,
  -- Denormalised from the queue row so a reading of the log needs no join, and
  -- so the log still identifies its subject in an export.
  item_type TEXT NOT NULL CHECK (item_type IN ('flashcard', 'exercise')),
  item_ref TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('forgotten', 'partial', 'correct', 'mastered')),
  -- Did the learner reveal the answer before rating themselves. Self-reported,
  -- and stored precisely because it is: a rating given without looking is not
  -- the same evidence as one given after comparing, and the difference must
  -- survive in the record instead of being flattened away.
  revealed BOOLEAN NOT NULL,
  interval_days INTEGER NOT NULL CHECK (interval_days >= 0),
  -- Both ends of the reschedule, so the log shows the shift this review caused
  -- without having to replay the ladder.
  previous_due_at TIMESTAMPTZ NOT NULL,
  next_due_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS review_attempts_item_idx
  ON review_attempts (user_id, item_type, item_ref, reviewed_at);

-- ---------------------------------------------------------------------------
-- 3. Remediation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS remediation_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  -- Nullable and SET NULL rather than CASCADE: a remediation outlives the queue
  -- entry that triggered it. Deleting the schedule must not delete the record
  -- that the learner still owes themselves this work.
  queue_item_id UUID REFERENCES review_queue(id) ON DELETE SET NULL,
  review_attempt_id UUID REFERENCES review_attempts(id) ON DELETE SET NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('flashcard', 'exercise')),
  item_ref TEXT NOT NULL,
  competency_id TEXT,
  -- Mirrors REMEDIATION_REASONS in packages/domain/src/review-scheduler.ts.
  reason TEXT NOT NULL CHECK (reason IN ('failed-review', 'failed-attempt')),
  micro_lesson TEXT NOT NULL,
  next_action TEXT NOT NULL,
  -- The isomorphic exercise to re-attempt, when the content offers one.
  exercise_id TEXT,
  -- Mirrors REMEDIATION_STATUSES in packages/domain/src/review-scheduler.ts.
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
  -- The deferred retest: the day the failed item itself comes back.
  due_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- A task that is no longer open must say when it stopped being open, and one
  -- that is still open must not claim a completion date.
  CHECK ((status = 'open') = (completed_at IS NULL))
);

-- At most one open task per item per learner. Partial rather than total, so
-- failing the same item again after closing the previous task is allowed and
-- creates a fresh one; it is only *simultaneous* duplicates that are refused.
CREATE UNIQUE INDEX IF NOT EXISTS remediation_tasks_one_open
  ON remediation_tasks (user_id, item_type, item_ref)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS remediation_tasks_due_idx
  ON remediation_tasks (user_id, status, due_at);

-- ---------------------------------------------------------------------------
-- 4. Row level security
-- ---------------------------------------------------------------------------
--
-- Same discipline as 0002 and 0003: ENABLE then FORCE, because without FORCE the
-- table owner — the role the application connects as — bypasses every policy and
-- the isolation is an illusion. USING filters what may be read, updated or
-- deleted; WITH CHECK stops a write from assigning a row to somebody else.

DO $$
DECLARE
  target TEXT;
  owned_tables TEXT[] := ARRAY[
    'review_queue',
    'review_attempts',
    'remediation_tasks'
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
