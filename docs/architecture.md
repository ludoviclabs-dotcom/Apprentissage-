# Architecture

Finance Learning Hub is a private, local-first learning cockpit.

The MVP starts with seeded learning data and a navigable Next.js interface. Document ingestion, RAG and AI agents are represented by stable package boundaries so they can be wired later without changing the user experience.

## Runtime

- `apps/web`: Next.js application.
- `packages/domain`: domains, competencies, exercises, corrections and seeded learning paths.
- `packages/db`: PostgreSQL/pgvector schema, Drizzle table definitions, migration SQL, seed script and repository functions.
- `packages/ai`: provider and agent contracts.
- `packages/ingest`: source pack and document ingestion primitives.
- `workers/ingestion-worker`: Docker boundary for future Docling/Python ingestion.

## Product Rule

The cockpit is organized around guided learning. Retrieval and AI features support the route, but the main user loop is:

1. diagnose current level;
2. follow the 30-day path;
3. study one concept;
4. answer one exercise;
5. read a structured correction;
6. update competency strength.

## Data Strategy

The app can run in two modes:

- Seeded fallback mode: default, no database required.
- Database mode: set `FINANCE_HUB_USE_DATABASE=true` and `DATABASE_URL`, then run migrations and seed.

Drizzle was chosen over Prisma for the MVP because the schema stays close to PostgreSQL/pgvector SQL, starts lighter in a monorepo, and keeps query code explicit while the domain model is still moving.

Current persistence coverage:

- source packs and documents;
- document pages and Markdown chunks during source-pack import;
- learning path, learning days, lessons and lesson source references;
- exercises loaded from DB when enabled;
- attempts and corrections;
- competency strength updates after correction or diagnostic;
- revision items scheduled after exercise correction;
- the active review queue, its attempt log and the remediation a failure opens.

The next persistence gap is durable user profiles and cohort-level analytics.

## Active Review

Review is a queue of due items, not a list of cards. `packages/domain/src/review-scheduler.ts` holds the whole algorithm: one fixed interval per self-assessment (1 / 3 / 7 / 14 days), a total order over the queue, and the rule that a forgotten item opens exactly one remediation task dated on its own retest. It is pure, so the schedule is reproducible in a unit test and explainable to the learner.

An item is `(item_type, item_ref)`, pointing at either a flashcard or an exercise, which is what lets a failed submission be scheduled for retest alongside the cards. `packages/db/src/review-repository.ts` merges the learner's stored schedule over the seeded catalogue on read, so a new account has a queue and a newly authored card appears without a backfill.

## Comptabilité générale v1

The first track built to be finished, in `packages/domain/src/compta-generale-v1.ts`: fourteen exercises over two levels covering the invoice cycle, VAT, the bank and a fixed asset, plus a six-step mini-case. Every exercise ships an authored specification, so nothing in the module is graded by the rubric matcher — asserted by test, not by intention.

`getActiveExerciseVersion` resolves `authoredExerciseVersions` when there is no database, which is what makes the typed evaluators grade identically in the public demo, locally and in CI. Before that they only ran against a seeded PostgreSQL.

Submitting a module exercise records a `direct` mastery event against its level, so answering a question moves progression. It cannot fail a submission: the outcome is reported as `progress.attributed` rather than raised. See `docs/adr/005-compta-generale-v1.md`.

The answer to an item is never part of a queue read. It is fetched from `POST /api/revisions/reveal` when the learner asks, so it is absent from the page source until then. See `docs/adr/004-active-review-scheduler.md` for the reasoning and the assumed limits of this first version.

## Public Demo Safeguard

Production without auth is read-only by default. The app shows a demo banner and blocks write routes for uploads and source-pack imports. Private mode requires auth plus a private database.
