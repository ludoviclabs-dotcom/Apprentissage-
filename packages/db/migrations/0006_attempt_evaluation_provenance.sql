-- Typed evaluators can produce fractional marks. Keeping an INTEGER alongside
-- the decimal value in correction_json makes stored attempts lie about the mark
-- that was actually shown to the learner.
--
-- `migrate.ts` replays every migration, so alter only legacy INTEGER columns;
-- once converted, subsequent runs are a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'attempts'
      AND column_name = 'score'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE attempts
      ALTER COLUMN score TYPE NUMERIC(5, 2) USING score::NUMERIC(5, 2);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'corrections'
      AND column_name = 'score'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE corrections
      ALTER COLUMN score TYPE NUMERIC(5, 2) USING score::NUMERIC(5, 2);
  END IF;
END;
$$;
