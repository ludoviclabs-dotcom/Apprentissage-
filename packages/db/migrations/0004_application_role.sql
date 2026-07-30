-- The web process must never connect as the table owner or a PostgreSQL
-- superuser: both bypass row-level security, even when FORCE ROW LEVEL
-- SECURITY is enabled. `pnpm db:configure-app-role` creates this role before
-- this migration is applied.
GRANT USAGE ON SCHEMA public TO finance_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO finance_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO finance_app;

-- Keep future application tables usable without silently falling back to an
-- owner connection. RLS still controls every user-owned table.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO finance_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO finance_app;
