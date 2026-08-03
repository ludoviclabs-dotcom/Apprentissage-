-- PR-07: Stripe billing, entitlements and completion certificates.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly — hence `IF NOT EXISTS` on every table and index, and
-- the `DROP POLICY IF EXISTS` before each `CREATE POLICY`, exactly as in 0002,
-- 0003 and 0007. PostgreSQL has no `CREATE POLICY IF NOT EXISTS`.
--
-- WHY TWO OF THESE FIVE TABLES HAVE NO ROW LEVEL SECURITY. Every user-owned
-- table in this schema is protected by a policy comparing `user_id` against
-- `app_current_user_id()`, which the application binds per transaction. A Stripe
-- webhook has no such context: it arrives as a signed POST carrying a *Stripe*
-- customer id, and turning that into an internal user id is the first thing that
-- has to happen. `billing_customers` is that lookup, so it cannot itself be
-- gated on knowing the answer. `billing_events` is the delivery ledger and is
-- keyed on a Stripe event id, not on a person.
--
-- This is the same exemption `app_users` and `user_sessions` already have in
-- 0002, for the same reason: identity resolution runs before identity exists.
-- Both tables are deliberately content-free — an id pair and an event receipt,
-- no amounts, no card data, no payload — so what they leak if the application
-- role is ever compromised is a mapping, not a billing history. Everything that
-- describes a person's subscription, access or attainment lives in the three
-- tables below them, each with ENABLE + FORCE row level security.
--
-- WHY ENTITLEMENTS ARE A TABLE RATHER THAN A VIEW OVER `subscriptions`. A
-- derived view would tie access to Stripe's shape forever, and would make a
-- manual grant — a beta tester, a refund handled by hand, a founder account —
-- impossible to express without inventing a fake subscription. `source` says
-- which kind of grant a row is, and `hasEntitlement` does not care.

-- ---------------------------------------------------------------------------
-- 1. Stripe customer ↔ learner
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS billing_customers (
  -- One Stripe customer per learner, enforced from both sides: the primary key
  -- stops a second customer being attached to an account, and the UNIQUE below
  -- stops one Stripe customer being pointed at two accounts. Without the pair,
  -- a duplicated checkout could quietly grant a subscription to the wrong user.
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Webhook delivery ledger
-- ---------------------------------------------------------------------------
--
-- Stripe delivers at least once, and retries any non-2xx for days. Replaying
-- `customer.subscription.deleted` is harmless, but replaying a grant would keep
-- resurrecting an entitlement that a later event revoked, so the handler claims
-- an event id here before doing any work and treats a claim that fails as
-- "already handled". No payload is stored: the ledger answers "did we see this
-- and what did we decide", which needs an id, a type and a verdict.

CREATE TABLE IF NOT EXISTS billing_events (
  stripe_event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  -- Mirrors the outcomes in packages/db/src/billing-repository.ts.
  outcome TEXT NOT NULL DEFAULT 'received'
    CHECK (outcome IN ('received', 'granted', 'revoked', 'ignored', 'unresolved')),
  -- The `BillingIntentReason` the mapper returned, kept for support questions
  -- of the form "why did this payment not open anything".
  detail TEXT NOT NULL DEFAULT '',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS billing_events_received_idx ON billing_events (received_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Subscriptions
-- ---------------------------------------------------------------------------
--
-- A local mirror of Stripe's state, never the source of truth. It exists so the
-- account page can say what the learner is paying for without calling Stripe on
-- every render, and so an operator can see a subscription this deployment could
-- not map to a plan.

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  -- Stripe's own status, stored verbatim and NOT constrained to a list: a status
  -- added to the API later must land in the row unchanged rather than be
  -- rejected or coerced. Which statuses grant access is decided in
  -- packages/domain/src/billing.ts, where it can be read and tested.
  status TEXT NOT NULL,
  -- Null when the price on the subscription is not one this deployment knows.
  plan_key TEXT,
  price_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  -- `event.created` of the newest event applied to this row, NOT the time it
  -- was applied. Stripe retries a failed delivery for up to three days, so a
  -- stale event can land after a newer one: the retry of an `active` update
  -- arriving behind the `past_due` that superseded it would otherwise reopen
  -- paid access on a subscription that had already failed. The application
  -- refuses any event older than this value.
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent add for anyone who applied an earlier revision of this file before
-- it shipped. `CREATE TABLE IF NOT EXISTS` above is a no-op once the table
-- exists, so a new column needs saying twice — the same pattern as 0002.
ALTER TABLE IF EXISTS subscriptions ADD COLUMN IF NOT EXISTS last_event_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions (user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Entitlements
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  -- Mirrors ENTITLEMENT_FEATURES in packages/domain/src/billing.ts. Not a CHECK
  -- constraint: naming a new premium feature should be a code change, not a
  -- migration, and an unknown feature name simply matches no gate.
  feature TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  source TEXT NOT NULL DEFAULT 'subscription' CHECK (source IN ('subscription', 'manual')),
  plan_key TEXT,
  -- Which subscription pays for this. Plain TEXT rather than a foreign key: the
  -- grant may be recorded from `checkout.session.completed` before the
  -- subscription row exists, and a manual grant has none at all.
  stripe_subscription_id TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL means "until revoked". Used by the provisional grant made at checkout,
  -- which the first subscription event replaces with a dated one.
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One row per feature per learner, updated in place. Two rows for the same
  -- feature would make "do they have access" a question about precedence.
  UNIQUE (user_id, feature),
  -- A revoked row must say when, and an active row must not claim a revocation.
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS entitlements_lookup_idx ON entitlements (user_id, feature, status);
CREATE INDEX IF NOT EXISTS entitlements_subscription_idx ON entitlements (stripe_subscription_id);

-- ---------------------------------------------------------------------------
-- 5. Completion certificates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  serial TEXT NOT NULL UNIQUE,
  track_id TEXT NOT NULL,
  track_label TEXT NOT NULL,
  -- Denormalised from `app_users` on purpose: the attestation names its holder,
  -- and changing an account's email later must not silently reprint a document
  -- that was issued to a different address.
  holder_email TEXT NOT NULL,
  curriculum_version_id TEXT NOT NULL,
  level_count INTEGER NOT NULL CHECK (level_count > 0),
  average_score INTEGER NOT NULL CHECK (average_score BETWEEN 0 AND 100),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Issuance is idempotent, not repeatable: asking twice returns the first one.
  -- Revocation is for a certificate issued in error, never for a subscription
  -- that later lapsed — the attestation records something that happened.
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  UNIQUE (user_id, track_id),
  CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS certificates_user_idx ON certificates (user_id, issued_at DESC);

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------
--
-- Same discipline as 0002, 0003 and 0007: ENABLE then FORCE, because without
-- FORCE the table owner bypasses every policy and the isolation is an illusion.
-- USING filters what may be read, updated or deleted; WITH CHECK stops a write
-- from assigning a row to somebody else.
--
-- `billing_customers` and `billing_events` are absent from this list for the
-- reason set out at the top of the file.

DO $$
DECLARE
  target TEXT;
  owned_tables TEXT[] := ARRAY[
    'subscriptions',
    'entitlements',
    'certificates'
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
