# ADR 001 — Local-first authentication, ownership and row level security (PR-01)

Status: accepted
Date: 2026-07-29

## Context

The roadmap in `docs/roadmap-pr-plan.md` specifies Supabase for PR-01:
`@supabase/ssr`, hosted Auth, `auth.uid()` policies, plus `organizations` and
`memberships`.

That conflicts with three standing rules in `CLAUDE.md`, which are marked as
overriding: *do not add SaaS connectors*, *do not assume internet access at
runtime*, *do not implement multi-tenant features unless explicitly requested*.
Supabase is a hosted service the running app would depend on, and organizations
plus memberships are multi-tenancy.

The decision that unblocked this: **row level security is a PostgreSQL feature,
not a Supabase one**. Every goal of PR-01 — real accounts, per-user ownership,
strict policies, automated proof of isolation — is reachable on the
`pgvector/pgvector:pg16` database already in `docker-compose.yml`.

## Decision

Implement authentication locally and keep Supabase out.

- **Passwords**: `node:crypto` scrypt, parameters stored inside the hash string so
  they can be raised without invalidating existing records. No new dependency.
- **Sessions**: opaque 256-bit tokens in an httpOnly `lax` cookie. Only the
  SHA-256 digest is stored, so database read access cannot be replayed as a login,
  and because sessions are rows they are revocable — a stateless JWT would not be.
- **Current user**: `app.current_user_id`, set with `set_config(..., true)` inside
  a transaction, read by an `app_current_user_id()` SQL function. This is the
  local analogue of `auth.uid()`.
- **Policies**: `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on every owned table,
  with SELECT/INSERT/UPDATE/DELETE policies keyed on
  `user_id = app_current_user_id()`. `FORCE` is what makes it real: without it the
  table owner — the role the application connects as — bypasses every policy.
- **No organizations or memberships.** Deferred until a real B2B need exists;
  `profiles` plus `user_id` covers a solo learner and keeps the policy surface
  small enough to test exhaustively.

### Two tables intentionally left uncovered

`app_users` and `user_sessions` have no RLS. The login flow must read them before
any user context exists, so a policy keyed on the current user could not work.

This is safe here in a way it would not be on Supabase: nothing outside this
application connects to the database. There is no browser-facing PostgREST, so
RLS is defence-in-depth against a missing `WHERE` clause in our own code, not a
boundary against hostile clients. No route handler exposes either table.

## Consequences

### Schema changes driven by discovered bugs

Mapping the repository surfaced per-user state stored on shared catalogue tables.
These were single-user bugs that would have become data corruption the moment a
second account existed:

- `recordAttempt` ran `UPDATE competencies SET strength = …`, so one account's
  exercise moved **every** account's competency strength. Progress now lives in
  `competency_progress (user_id, competency_id)`; the catalogue column stays as the
  seeded starting point.
- `reviewFlashcard` ran `UPDATE flashcards SET status, due_at, interval_days`, so
  one rating rescheduled the card for everyone. Now `flashcard_states`.
- `recordDiagnostic` averaged against the **seeded array value** rather than the
  stored one, dragging real progress back toward the baseline on every re-run.
- `startExam` inserted live runs into `exam_sessions`, the table `seed.ts` fills
  with templates — which is why `/annales-concours` accumulated duplicate
  in-progress rows. Runs now live in `exam_runs` with a partial unique index
  allowing one live run per exam per user. `exam_sessions` stays a global,
  RLS-free catalogue so seeding keeps working.
- Primary keys of the form `attempt-${Date.now()}` collide when two accounts
  submit in the same millisecond. New rows use `randomUUID()`.

### Seed fallback is now scoped to the demo

Read functions previously returned seeded content whenever a query failed **or
returned zero rows**. Under RLS that is actively harmful: a brand-new account has
no rows, so it would have been shown the seed corpus as its own history, and an
RLS `permission denied` would have looked like success.

`getErrorJournal`, `getCorrectionHistory`, `getFlashcards`, `getCompetencies` and
`getProgressSnapshot` now take an optional `userId`. With a user, an empty result
stays empty. Without one — the anonymous public demo — the seeded fallback is
unchanged.

### Shared browser credentials are retired

`LEARNING_HUB_AUTH_ENABLED` now means account-based authentication and requires
`FINANCE_HUB_USE_DATABASE=true`. Retired shared-credential settings are rejected
at boot rather than ignored, so a stale `.env` cannot leave someone believing the
app is gated when it is not.

### Verification

- 13 isolation tests in `packages/db/test/rls.integration.test.ts` run against a
  real PostgreSQL in CI. They assert RLS is enabled *and* forced on all ten owned
  tables, that cross-user reads return nothing, that a forged `user_id` on INSERT
  is rejected, that UPDATE/DELETE across users affect zero rows, that an unset or
  malformed `app.current_user_id` denies rather than errors open, and that the
  pedagogical catalogue stays publicly readable.
- The CI job fails if those tests **skip**, so a silently-skipped suite cannot be
  mistaken for proof.
- A `authenticated` Playwright project covers signup, wrong password, protected-route
  redirect, and two browser contexts never seeing each other's identity.

### Chosen against pgTAP

The roadmap asked for pgTAP. It is not bundled in the `pgvector` image and would
add a second test runner and a `supabase/` directory that no longer has a purpose
here. The Vitest integration tests prove the same properties, run in the same
command as everything else, and can assert on `pg_class.relforcerowsecurity`
directly.

## Not in this PR

- Rate limiting on `/api/auth/login`. Signup and login are otherwise unthrottled.
- Password reset and email verification. There is no mail transport, by design.
- `learning_paths.current_day` and `learning_days.status` remain global. PR-02
  replaces progression with enrolments and mastery snapshots, which is the right
  place to make them per-user.
- `POST /api/exercises/attempts` and `POST /api/learning/diagnostic` still have no
  public-demo guard; they are now blocked by `resolveWriteUser()` whenever
  persistence is on, which closes the practical gap.
- `createDb()` still opens a new connection pool per call and never closes it. RLS
  work made this more visible, not worse; a shared pool belongs in its own change.
