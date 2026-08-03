-- PR-11: canonical level vocabulary and trustworthy mastery provenance.
-- Existing learner rows are preserved; nullable provenance columns are the
-- compatibility adapter for events recorded before this migration.

ALTER TABLE module_levels
  ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'module_levels_publication_status_check'
  ) THEN
    ALTER TABLE module_levels
      ADD CONSTRAINT module_levels_publication_status_check
      CHECK (publication_status IN ('published', 'planned'));
  END IF;
END;
$$;

ALTER TABLE mastery_events
  ADD COLUMN IF NOT EXISTS exercise_version_id TEXT REFERENCES exercise_versions(id),
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_event_id TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mastery_events_source_type_check'
  ) THEN
    ALTER TABLE mastery_events
      ADD CONSTRAINT mastery_events_source_type_check
      CHECK (
        source_type IS NULL OR
        source_type IN ('graded_attempt', 'review', 'case_study', 'diagnostic')
      );
  END IF;
END;
$$;

-- NULL is permitted only for pre-PR-11 compatibility rows. Every new repository
-- write supplies a source event id; duplicate delivery of that evidence is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS mastery_events_source_once_idx
  ON mastery_events (user_id, kind, source_event_id)
  WHERE source_event_id IS NOT NULL;

UPDATE mastery_snapshots SET status = 'in_progress' WHERE status = 'in-progress';
UPDATE mastery_snapshots SET status = 'passed' WHERE status = 'acquired';

ALTER TABLE mastery_snapshots
  DROP CONSTRAINT IF EXISTS mastery_snapshots_status_check;

ALTER TABLE mastery_snapshots
  ADD CONSTRAINT mastery_snapshots_status_check
  CHECK (status IN ('locked', 'available', 'in_progress', 'passed', 'planned'));
