-- PR-06: admit `spreadsheet` as an evaluation type.
--
-- IDEMPOTENCE IS MANDATORY. `packages/db/src/migrate.ts` replays every file in
-- `migrationFiles` on each `pnpm db:migrate`, so every statement here must be
-- safe to run repeatedly. PostgreSQL has no `ALTER CONSTRAINT ... IF EXISTS`
-- for a CHECK, hence the DROP-then-ADD pair, which is replayable because the
-- DROP carries `IF EXISTS`.
--
-- WHY A MIGRATION AT ALL. `exercise_versions.evaluation_type` carries a CHECK
-- constraint listing the accepted engines, deliberately: an unrecognised value
-- means no evaluator can grade the row, and the column is the last place that
-- can still say so cheaply. Adding an engine therefore has to widen the list,
-- and a seed run against an un-migrated database fails loudly on the constraint
-- rather than writing a specification nothing can read.
--
-- The constraint name is the one PostgreSQL generates for an inline column
-- CHECK in migration 0005 — `<table>_<column>_check`. Dropping by that name is
-- safe here because 0005 declares exactly one CHECK on the column, so there is
-- no ambiguity about which constraint is being replaced.

ALTER TABLE exercise_versions
  DROP CONSTRAINT IF EXISTS exercise_versions_evaluation_type_check;

ALTER TABLE exercise_versions
  ADD CONSTRAINT exercise_versions_evaluation_type_check
  -- Mirrors EVALUATION_TYPES in packages/domain/src/evaluators/types.ts.
  -- `legacy_rubric` stays accepted so already-authored exercises keep grading
  -- through the previous rubric matcher; it has no entry in the evaluator
  -- registry, so nothing new can be authored against it.
  CHECK (evaluation_type IN (
    'multiple_choice',
    'numeric',
    'journal_entry',
    'short_text_rubric',
    'spreadsheet',
    'legacy_rubric'
  ));
