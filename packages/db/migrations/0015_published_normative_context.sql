-- PR-35: the referential a published version is true against.
--
-- WHAT THE DATABASE WAS LOSING. `normativeContext` says whether a piece of
-- course material states the plan in force (`anc-2026-current`), the original
-- support's superseded treatment (`course-original`), or a subdivision local to
-- one entity (`entity-specific`) — and, with `scoringPolicy`, whether its answer
-- may correct a learner at all. The file store carried it from the day it was
-- introduced; `published_content_versions` had no column for it, so the write
-- dropped it and the read could not find it.
--
-- The failure was silent and it inverted the meaning. `resolveNormativeContext`
-- treats an absent context as the referential in force — the right default for a
-- row written before the model existed, and exactly the wrong one for a row that
-- *had* a context and lost it in transit. A card published as
-- `course-original` / `comparison-only` therefore came back from PostgreSQL as
-- current and gradable: it would have entered the spaced-repetition queue and
-- corrected learners against a treatment replaced on 1 January 2026. The whole
-- point of the model, undone by the storage layer.
--
-- IDEMPOTENCE IS MANDATORY, as in 0012, 0013 and 0014: every statement is
-- replayed on each `pnpm db:migrate`. Hence `ADD COLUMN IF NOT EXISTS` and the
-- `pg_constraint` guard around every CHECK.

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------
--
-- NULLABLE, AND THAT IS NOT A CONCESSION. A row written before this migration
-- has no context and never had one; forcing NOT NULL would either refuse the
-- migration on an existing install or require inventing a referential for
-- content nobody classified. `NULL` states the fact — "not established" — and
-- `resolveNormativeContext` keeps reading it as the referential in force, which
-- is what those rows meant when they were written.
--
-- What must not happen is a *new* publication landing with a null context. That
-- is enforced where the decision is made, by the publication guard, which
-- refuses before writing rather than after: a CHECK could not tell an old row
-- from a new one.

ALTER TABLE published_content_versions
  ADD COLUMN IF NOT EXISTS normative_context_snapshot JSONB;

-- Two columns denormalised out of the JSONB, deliberately.
--
-- The chapter screens and the spaced-repetition queue need one thing from the
-- context — may this content grade a learner? — and they need it for every
-- active version of a chapter. Reading it out of the JSONB would mean selecting
-- `normative_context_snapshot` in the summary query, which is precisely the
-- payload the summary exists to avoid dragging across the wire. The file store's
-- index already carries the same two fields for the same reason; both stores
-- therefore answer "what is published here, and what may be graded" without
-- opening a snapshot.
--
-- They are derived, never authored: `recordPublishedVersion` fills them from the
-- snapshot it is given, so they cannot drift from it by hand.

ALTER TABLE published_content_versions
  ADD COLUMN IF NOT EXISTS normative_profile TEXT;

ALTER TABLE published_content_versions
  ADD COLUMN IF NOT EXISTS scoring_policy TEXT;

-- ---------------------------------------------------------------------------
-- 2. The value constraints
-- ---------------------------------------------------------------------------
--
-- Mirrors `normativeProfiles` and `scoringPolicies` in
-- packages/content-generation. `NULL` stays admissible — that is the pre-0015
-- row — but an unknown *value* is not: a typo in a profile name would otherwise
-- be read as "some other referential" by every consumer downstream.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_profile_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_profile_check
      CHECK (
        normative_profile IS NULL
        OR normative_profile IN ('anc-2026-current', 'course-original', 'entity-specific')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_scoring_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_scoring_check
      CHECK (
        scoring_policy IS NULL
        OR scoring_policy IN ('graded', 'comparison-only', 'not-gradable')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'published_content_versions_normative_pair_check'
  ) THEN
    ALTER TABLE published_content_versions
      ADD CONSTRAINT published_content_versions_normative_pair_check
      -- The three columns describe one fact and must agree on whether it is
      -- known. A row carrying a profile but no snapshot could not be audited
      -- back to what was published; a snapshot with no profile would leave the
      -- summary queries reading "unclassified" for a content that is classified.
      CHECK (
        (normative_context_snapshot IS NULL AND normative_profile IS NULL AND scoring_policy IS NULL)
        OR (normative_context_snapshot IS NOT NULL AND normative_profile IS NOT NULL AND scoring_policy IS NOT NULL)
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The index the graded queue reads
-- ---------------------------------------------------------------------------
--
-- "The active, gradable versions of this chapter" is the query behind the
-- spaced-repetition queue and the mastery catalogue. Without this index it is a
-- filter applied after the chapter scan; with it, the two screens that run on
-- every chapter view stay on an index.

CREATE INDEX IF NOT EXISTS published_content_versions_scoring_idx
  ON published_content_versions (module, chapter, scoring_policy)
  WHERE status = 'published';

-- No back-fill. Rewriting the old rows' context would mean asserting a
-- referential nobody reviewed, and doing it silently — which is the very move
-- the normative model exists to prevent. They stay null until someone
-- republishes them through the guard.
