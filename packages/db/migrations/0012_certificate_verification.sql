-- PR-13: public verification, revocation with an audit trail, and re-issue.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly: `ADD COLUMN IF NOT EXISTS`, `IF NOT EXISTS` on tables
-- and indexes, and `DROP … IF EXISTS` before each `CREATE POLICY`.

-- ---------------------------------------------------------------------------
-- 1. What a certificate now carries
-- ---------------------------------------------------------------------------

ALTER TABLE certificates
  -- The opaque capability behind /verify. Separate from `serial` on purpose:
  -- the serial carries 40 bits and its own comment calls it "not a secret",
  -- which was true while a certificate was readable by its owner alone. A
  -- public page keyed on it would let a guessed URL disclose a holder's name.
  ADD COLUMN IF NOT EXISTS verification_id TEXT,
  -- The name as printed. Frozen: renaming an account must not silently rewrite
  -- a document already in someone's hands.
  ADD COLUMN IF NOT EXISTS holder_label TEXT NOT NULL DEFAULT '',
  -- Everything the PDF asserts, as asserted. Re-deriving it at download time
  -- would let the document change under a holder who has done nothing.
  ADD COLUMN IF NOT EXISTS content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  -- Who revoked, for the internal audit trail. The *reason* stays internal too
  -- and is never projected to the public table below.
  ADD COLUMN IF NOT EXISTS revoked_by TEXT,
  -- Set on the old row when a re-issue replaces it.
  ADD COLUMN IF NOT EXISTS superseded_by_serial TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certificates_status_check'
  ) THEN
    ALTER TABLE certificates
      ADD CONSTRAINT certificates_status_check
      CHECK (status IN ('active', 'revoked', 'superseded'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS certificates_verification_id_key
  ON certificates (verification_id)
  WHERE verification_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. One *active* certificate per track, not one ever
-- ---------------------------------------------------------------------------
--
-- `UNIQUE (user_id, track_id)` from 0009 said a learner gets one attestation per
-- track for all time. Re-issuing on a curriculum change needs a second row for
-- the same pair — the old one is kept, marked `superseded`, and stays
-- verifiable, because the copy in circulation does not disappear when the
-- syllabus is revised.
--
-- The partial index keeps the guarantee that actually matters: never two live
-- certificates for the same track. Same shape as `remediation_tasks_one_open`
-- in 0007.

ALTER TABLE certificates DROP CONSTRAINT IF EXISTS certificates_user_id_track_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS certificates_one_active
  ON certificates (user_id, track_id)
  WHERE status = 'active';

-- Backfill: rows issued before this migration are active unless already
-- revoked, and the paired CHECK from 0009 guarantees revoked rows have a reason.
UPDATE certificates SET status = 'revoked' WHERE revoked_at IS NOT NULL AND status = 'active';

-- ---------------------------------------------------------------------------
-- 3. The public verification projection
-- ---------------------------------------------------------------------------
--
-- WHY A SEPARATE TABLE RATHER THAN A POLICY ON `certificates`.
--
-- `certificates` is ENABLE + FORCE row level security, keyed on
-- `app_current_user_id()`. A verification page has no session by design — the
-- point is that a recruiter holding the PDF can check it — so it can never
-- satisfy that policy. The three ways out were: widen the policy to allow
-- anonymous reads, add a SECURITY DEFINER function, or project the public
-- fields into their own table.
--
-- The projection wins because it makes the leak *structurally* impossible
-- rather than merely forbidden: `holder_email`, `user_id`, `average_score` and
-- the revocation reason are not columns here, so no query against this table
-- can return them, however it is written later. The first two options would
-- have left the e-mail one `SELECT *` away.
--
-- It carries no RLS for the same reason `billing_customers` carries none
-- (ADR-007): the row is *meant* to be readable by anyone holding the opaque id.
-- The access control is the 160-bit identifier, not the policy engine.

CREATE TABLE IF NOT EXISTS certificate_verifications (
  verification_id TEXT PRIMARY KEY,
  serial TEXT NOT NULL UNIQUE,
  -- The holder as printed on the document. This is the one personal datum here,
  -- and it is the minimum the feature exists to confirm: a verifier is checking
  -- that *this* document belongs to *this* person.
  holder_label TEXT NOT NULL,
  track_label TEXT NOT NULL,
  curriculum_version_id TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'superseded')),
  revoked_at TIMESTAMPTZ,
  -- Deliberately no `revoked_reason`: why a certificate was withdrawn is an
  -- internal matter between the operator and the holder, and publishing it on a
  -- URL anyone with the QR code can open would be a disclosure of its own.
  superseded_by_serial TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certificate_verifications_serial_idx
  ON certificate_verifications (serial);

-- ---------------------------------------------------------------------------
-- 4. The revocation audit trail
-- ---------------------------------------------------------------------------
--
-- WHY REVOCATION DOES NOT WRITE `certificates`.
--
-- An operator revoking somebody else's attestation cannot reach that row:
-- `certificates` is FORCE row level security keyed on `app_current_user_id()`,
-- and an administrator is not the owner. The two ways to force it open were an
-- admin policy or a SECURITY DEFINER function — both amount to "a policy plus a
-- documented hole through it", which ADR-007 already rejected once.
--
-- So the status a verifier sees lives in `certificate_verifications`, which is
-- the table the public page reads anyway, and that is the single authority on
-- whether an attestation still stands. `certificates` keeps the frozen content
-- and the owner link; it is never written by anyone but its owner.
--
-- The reason lands here rather than on the projection because it is internal:
-- the holder and the operator may discuss it, a stranger with the QR code may
-- not read it.

CREATE TABLE IF NOT EXISTS certificate_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial TEXT NOT NULL REFERENCES certificate_verifications(serial) ON DELETE CASCADE,
  -- Free text, written by an operator. Never projected to the public page.
  reason TEXT NOT NULL,
  -- The administrator's e-mail as configured in LEARNING_HUB_ADMIN_EMAILS.
  -- An audit trail with no actor is not an audit trail.
  revoked_by TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS certificate_revocations_serial_idx
  ON certificate_revocations (serial, revoked_at DESC);
