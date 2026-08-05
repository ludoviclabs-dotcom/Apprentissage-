-- PR-14: the content factory's drafts, and the trail of what was decided about
-- each of them.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT
-- EXISTS`, and the `pg_constraint` guard of 0012 around every CHECK.
--
-- The CHECKs are added through that guard rather than written inline in the
-- table body on purpose. `CREATE TABLE IF NOT EXISTS` ignores its entire body
-- once the table exists, so a constraint written there is applied on the very
-- first run and never again — a table created by an earlier revision of this
-- file would carry no constraint at all, and no replay would repair it. Named
-- constraints, each behind its own guard, converge instead.
--
-- THERE IS NO `published` STATUS, AND THAT IS THE POINT.
--
-- The five values allowed below mirror `contentDraftStatuses` in
-- packages/content-generation/src/types/status.ts exactly. Publication is out of
-- scope for this lot: an approved draft is promoted into the catalogue tables
-- (`lessons`, `flashcards`, `exercises`) by a later one, and until that exists
-- no row here can claim to be public. Leaving `published` out of the CHECK makes
-- the leak structurally impossible rather than merely forbidden — the database
-- refuses the write, instead of a forgotten `WHERE status = 'published'` filter
-- on some public read being the only thing standing between a draft and the
-- site.

-- ---------------------------------------------------------------------------
-- 1. The drafts
-- ---------------------------------------------------------------------------
--
-- WHY THERE IS NO `user_id` AND NO ROW LEVEL SECURITY.
--
-- A draft is administration content, not somebody's data: it is generated from
-- the shared source packs, reviewed by whoever operates the platform, and
-- destined for the shared catalogue. There is no owner to police. Adding a
-- `user_id` would invent one, and the policy keyed on it would then have to be
-- widened so a second reviewer could see the first one's queue — that is a
-- policy plus a documented hole through it, the shape ADR-007 already rejected
-- once for `certificate_verifications`.
--
-- What protects these rows is therefore the same pair as that public
-- projection: they carry no personal data at all — no user id, no e-mail, no
-- score, nothing about a learner — and the only routes that read or write them
-- sit behind `requireAdmin`. The absence of personal data is structural rather
-- than a matter of discipline: a leak of this table discloses unpublished course
-- material, which is a content problem and never a privacy one.
--
-- This table is deliberately absent from `userOwnedTables` in
-- packages/db/src/schema.ts for that reason, and so is the trail below.

CREATE TABLE IF NOT EXISTS content_drafts (
  -- Deterministic, produced by the factory as `draft-<hex>` from the hash of its
  -- inputs: regenerating the same chapter from the same sources addresses the
  -- same row again instead of forking a second copy of it.
  id TEXT PRIMARY KEY,
  -- Mirrors `contentTypes` in packages/content-generation/src/types/artifact.ts.
  content_type TEXT NOT NULL,
  -- Mirrors `contentDraftStatuses`; see the header on the missing `published`.
  status TEXT NOT NULL,
  chapter_slug TEXT NOT NULL,
  chapter_label TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  -- The typed content, discriminated by `content_type`. JSONB rather than six
  -- tables: the six payload shapes share every column above and differ only
  -- here, and the shape is validated by the Zod schemas of
  -- packages/content-generation at the application boundary — never by the
  -- database, which would only ever hold a stale second copy of those rules.
  payload JSONB NOT NULL,
  -- Provider, model, prompt id and version, input hash, source ids. Never an API
  -- key: `generationMetadataSchema` names the provider, not the secret used to
  -- reach it.
  generation_metadata JSONB NOT NULL,
  -- Null until the validators have run. Distinct from `'{}'` on purpose: "not
  -- checked yet" and "checked, nothing to report" are different facts, and a
  -- review queue that confuses them shows unchecked content as clean.
  validation_metadata JSONB,
  -- Empty until a human touches it, hence a default rather than a nullable
  -- column: there is no third state between "nobody has reviewed this" and "here
  -- is what the reviewer said".
  review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Promoted out of `generation_metadata` so drafts can be filtered and counted
  -- by pack without opening the JSON.
  source_pack_id TEXT NOT NULL,
  -- Bumped when an approved draft is taken up again; nothing is overwritten in
  -- place. Mirrors `reviewMetadata.revision`.
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_drafts_content_type_check'
  ) THEN
    ALTER TABLE content_drafts
      ADD CONSTRAINT content_drafts_content_type_check
      CHECK (content_type IN (
        'smart_revision_sheet',
        'flashcard',
        'calculation_exercise',
        'journal_entry_exercise',
        'error_diagnosis_exercise',
        'progressive_case'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_drafts_status_check'
  ) THEN
    ALTER TABLE content_drafts
      ADD CONSTRAINT content_drafts_status_check
      -- No `published`. See the header: the omission is the guarantee.
      CHECK (status IN (
        'draft',
        'validation_failed',
        'needs_review',
        'approved',
        'rejected'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_drafts_difficulty_check'
  ) THEN
    ALTER TABLE content_drafts
      ADD CONSTRAINT content_drafts_difficulty_check
      -- The 1–5 scale of `contentDraftEnvelopeSchema.difficulty`.
      CHECK (difficulty BETWEEN 1 AND 5);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_drafts_revision_check'
  ) THEN
    ALTER TABLE content_drafts
      ADD CONSTRAINT content_drafts_revision_check
      CHECK (revision >= 1);
  END IF;
END;
$$;

-- The review interface works one chapter at a time, and the queue is read as
-- "what is waiting, oldest touched first".
CREATE INDEX IF NOT EXISTS content_drafts_chapter_status_idx
  ON content_drafts (chapter_slug, status);

CREATE INDEX IF NOT EXISTS content_drafts_status_updated_idx
  ON content_drafts (status, updated_at);

-- ---------------------------------------------------------------------------
-- 2. What was decided, and by whom
-- ---------------------------------------------------------------------------
--
-- Append-only, like `unlock_events` and `certificate_revocations`: a history
-- that can be updated is not a history. It is a table of its own rather than a
-- JSON column on the draft because a draft is rewritten on every regeneration,
-- and the record of who approved what must survive that rewrite.
--
-- ON DELETE CASCADE is the right choice here, unlike on an audit trail of
-- money or attestations: the trail describes a draft that never reached the
-- catalogue, so once the draft is gone there is nothing left for it to explain.

CREATE TABLE IF NOT EXISTS content_draft_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id TEXT NOT NULL REFERENCES content_drafts(id) ON DELETE CASCADE,
  -- Null on the first transition: a draft that has just been generated comes
  -- from nowhere, and writing `'draft'` there would invent a state it was never
  -- in.
  from_status TEXT,
  to_status TEXT NOT NULL,
  -- A human account, or a machine origin (`cli:generate`, `validator`). A trail
  -- with no actor is not a trail.
  actor TEXT NOT NULL,
  comment TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_draft_transitions_to_status_check'
  ) THEN
    ALTER TABLE content_draft_transitions
      ADD CONSTRAINT content_draft_transitions_to_status_check
      CHECK (to_status IN (
        'draft',
        'validation_failed',
        'needs_review',
        'approved',
        'rejected'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_draft_transitions_from_status_check'
  ) THEN
    ALTER TABLE content_draft_transitions
      ADD CONSTRAINT content_draft_transitions_from_status_check
      -- Same enumeration, but NULL stays legal — that is the "generated, came
      -- from nowhere" case above. A trail whose origin column accepts anything
      -- would let a typo pass for a state the product never had.
      CHECK (from_status IS NULL OR from_status IN (
        'draft',
        'validation_failed',
        'needs_review',
        'approved',
        'rejected'
      ));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS content_draft_transitions_draft_idx
  ON content_draft_transitions (draft_id, occurred_at);
