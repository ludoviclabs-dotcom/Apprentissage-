-- PR-15: publication of approved content, and the activity a learner actually
-- performs on a published chapter.
--
-- IDEMPOTENCE IS MANDATORY, as in 0012 and 0013: every statement is replayed on
-- each `pnpm db:migrate`, so CHECK constraints go through the `pg_constraint`
-- guard rather than the table body, which `CREATE TABLE IF NOT EXISTS` skips
-- once the table exists.
--
-- WHY THE PUBLIC SITE DOES NOT READ THESE TABLES.
--
-- The published snapshots themselves live in `content/published/`, a committed
-- directory. That is not a shortcut around the database: it is what lets the
-- public chapter work in seeded mode, be reviewed as a diff before it reaches
-- production, and survive a build that touches no network. The guard in
-- `@finance/content-publication` proves a snapshot carries no private path, no
-- secret and no mock fixture before it can be written there, which is exactly
-- what forbids committing a *draft* and stops applying once that proof is made.
--
-- What these tables hold is therefore not the content but the *acts*: which
-- version is current on an install that persists, who published it, when, in
-- place of what. Those are facts the file store cannot record — a file has no
-- author — and they are the audit trail the review workflow needs.

-- ---------------------------------------------------------------------------
-- 1. The published versions
-- ---------------------------------------------------------------------------
--
-- No `user_id`, no row level security, for the same reason as `content_drafts`
-- (see 0013): published course material is shared content, has no owner to
-- police, and carries no personal data. Writes sit behind `requireAdmin`.

CREATE TABLE IF NOT EXISTS published_content_versions (
  -- `pub-<type>-<chapter>-<slug>-v<n>`, deterministic and readable in a diff.
  id TEXT PRIMARY KEY,
  -- The draft this is a snapshot of. Traceability only: no read dereferences it,
  -- and no foreign key, because a published version must outlive the draft that
  -- produced it — deleting a draft must never delete published course material.
  source_artifact_id TEXT NOT NULL,
  -- Mirrors `contentTypes` in packages/content-generation.
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  domain TEXT NOT NULL,
  module TEXT NOT NULL,
  chapter TEXT NOT NULL,
  chapter_label TEXT NOT NULL,
  -- The content itself, copied. Never a reference: an edit upstream must not
  -- change retroactively what a visitor has already read.
  content_snapshot JSONB NOT NULL,
  -- Pack, document, nature, pages, section — never the excerpt text. The
  -- excerpts come from private PDFs; the projection that builds this column
  -- drops them before they can reach a shared table.
  source_references_snapshot JSONB NOT NULL,
  publication_version INTEGER NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by TEXT NOT NULL,
  generation_metadata_snapshot JSONB NOT NULL,
  validation_metadata_snapshot JSONB NOT NULL,
  review_metadata_snapshot JSONB NOT NULL,
  -- SHA-256 of the canonical content. Recomputed on read: a hand-edited row
  -- fails integrity rather than reaching a reader.
  content_hash TEXT NOT NULL,
  -- Only `published` and `archived`. There is no `deleted`: an old version is
  -- kept, always.
  status TEXT NOT NULL DEFAULT 'published',
  previous_published_version_id TEXT,
  archived_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_type_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_type_check
      CHECK (artifact_type IN (
        'smart_revision_sheet',
        'flashcard',
        'calculation_exercise',
        'journal_entry_exercise',
        'error_diagnosis_exercise',
        'progressive_case'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_status_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_status_check
      CHECK (status IN ('published', 'archived'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_version_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_version_check
      CHECK (publication_version >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_archived_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_archived_check
      -- An archived version has an archival date and an active one does not.
      -- Without this, "archived with no date" would be a state the history could
      -- not explain, and the two columns could disagree about the same fact.
      CHECK (
        (status = 'archived' AND archived_at IS NOT NULL)
        OR (status = 'published' AND archived_at IS NULL)
      );
  END IF;
END;
$$;

-- ONE ACTIVE VERSION PER LOGICAL IDENTITY.
--
-- A partial unique index rather than application-level discipline: the whole
-- point of the publication layer is that a public page never has to choose
-- between two candidates, and a rule enforced only in code is one forgotten
-- transaction away from being false. Archived rows are excluded, so a chapter
-- can accumulate as much history as it likes.
CREATE UNIQUE INDEX IF NOT EXISTS published_content_versions_active_idx
  ON published_content_versions (artifact_type, chapter, slug)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS published_content_versions_chapter_idx
  ON published_content_versions (module, chapter, status);

CREATE INDEX IF NOT EXISTS published_content_versions_source_idx
  ON published_content_versions (source_artifact_id);

-- ---------------------------------------------------------------------------
-- 2. The audit trail
-- ---------------------------------------------------------------------------
--
-- Append-only, like `content_draft_transitions` and `certificate_revocations`.
-- Unlike the draft trail, this one does NOT cascade on delete: it records that
-- material was made public, which stays true — and stays worth explaining —
-- after the version row is gone. An audit of publication that disappears with
-- what it audits is not an audit.

CREATE TABLE IF NOT EXISTS content_publication_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  -- The version this act produced, or acted upon. Text rather than a foreign
  -- key, deliberately: see above.
  version_id TEXT NOT NULL,
  previous_version_id TEXT,
  artifact_type TEXT NOT NULL,
  chapter TEXT NOT NULL,
  slug TEXT NOT NULL,
  publication_version INTEGER NOT NULL,
  -- The account that acted. A trail with no actor is not a trail.
  actor TEXT NOT NULL,
  comment TEXT,
  content_hash TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_publication_audit_action_check'
  ) THEN
    ALTER TABLE content_publication_audit
      ADD CONSTRAINT content_publication_audit_action_check
      CHECK (action IN ('publish', 'republish', 'archive'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS content_publication_audit_version_idx
  ON content_publication_audit (version_id, occurred_at);

CREATE INDEX IF NOT EXISTS content_publication_audit_chapter_idx
  ON content_publication_audit (chapter, occurred_at);

-- ---------------------------------------------------------------------------
-- 3. What a learner actually did on a published chapter
-- ---------------------------------------------------------------------------
--
-- THIS ONE IS PERSONAL DATA, so it carries `user_id` and lives under RLS like
-- every other learner-owned table. It is the evidence the chapter's progression
-- is computed from: `computeChapterProgress` reads these rows and nothing else,
-- which is what makes "the progression comes from real activity" checkable
-- rather than merely claimed.
--
-- No `score` column beyond the mark: the error journal already records what went
-- wrong, and duplicating a learner's mistakes here would spread personal data
-- over two tables for no gain.

CREATE TABLE IF NOT EXISTS chapter_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module TEXT NOT NULL,
  chapter TEXT NOT NULL,
  -- Mirrors `CHAPTER_ACTIVITY_KINDS` in @finance/content-publication.
  kind TEXT NOT NULL,
  -- The published version worked on.
  artifact_id TEXT NOT NULL,
  succeeded BOOLEAN NOT NULL,
  -- 0–20, when the activity is graded. Null for a consultation.
  score NUMERIC(5, 2),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chapter_activity_events_kind_check'
  ) THEN
    ALTER TABLE chapter_activity_events
      ADD CONSTRAINT chapter_activity_events_kind_check
      CHECK (kind IN (
        'sheet_viewed',
        'active_recall',
        'flashcard_reviewed',
        'calculation_attempt',
        'journal_entry_attempt',
        'diagnosis_attempt',
        'case_step_attempt'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chapter_activity_events_score_check'
  ) THEN
    ALTER TABLE chapter_activity_events
      ADD CONSTRAINT chapter_activity_events_score_check
      CHECK (score IS NULL OR (score >= 0 AND score <= 20));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS chapter_activity_events_user_chapter_idx
  ON chapter_activity_events (user_id, module, chapter, occurred_at);

-- Row level security, in the exact shape 0002/0003/0007 established: one policy
-- per operation, keyed on `app_current_user_id()`, replayed through
-- `DROP POLICY IF EXISTS` because PostgreSQL has no `CREATE POLICY IF NOT
-- EXISTS`. USING filters what may be read, updated or deleted; WITH CHECK stops
-- a write from assigning a row to somebody else. The table is also added to
-- `userOwnedTables` in packages/db/src/schema.ts, so the boundary test sees it.

DO $$
DECLARE
  target TEXT := 'chapter_activity_events';
BEGIN
  IF to_regclass(target) IS NULL THEN
    RETURN;
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
END;
$$;
