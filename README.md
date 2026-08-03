# Finance Learning Hub

Private local-first learning cockpit for accounting, cost accounting, management control, IFRS/IAS, ISO, fiscalité and finance.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript 5.9
- pnpm workspace (`apps/*`, `packages/*`, `workers/*`) via Corepack
- PostgreSQL + pgvector with Drizzle, optional — the app runs on seeded data by default
- Vitest (unit) · Playwright (end-to-end) · ESLint 9 flat config
- Deployed on Vercel

Node.js `>=22` is required; `.nvmrc` pins the version CI uses.

## Run Locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000`.

`.env` is optional and git-ignored: with no configuration at all the app boots on seeded data. Copy `.env.example` when you need database, auth or AI mode. Configuration is validated at boot by `apps/web/lib/env.ts` — missing values are fine, contradictory ones fail fast with the full list of problems.

Production without auth is treated as a read-only public demo. Write actions (uploads, source-pack imports, exams, revisions, business cases) return `403`, and the matching UI controls render disabled with the reason shown before the click.

## Checks

```bash
corepack pnpm check
```

Runs lint, typecheck, unit tests and build. Individually:

```bash
corepack pnpm lint       # eslint over apps, packages and scripts
corepack pnpm typecheck  # tsc --noEmit in every workspace package
corepack pnpm test       # vitest, unit only
corepack pnpm build      # next build
```

End-to-end smoke tests build and boot the app, so they run separately:

```bash
corepack pnpm exec playwright install chromium   # once
corepack pnpm test:e2e
```

The suite serves the production build on port `3100` and does not collide with a `pnpm dev` session on `3000`.

## Database

Start PostgreSQL + pgvector:

```bash
docker compose up -d postgres redis
```

Then copy `.env.example` to `.env`, set `FINANCE_HUB_USE_DATABASE=true` **and** `DATABASE_URL`, and run:

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
```

Setting the flag without the URL is rejected at boot rather than falling back to seeded data silently.

## Accounts

Set `LEARNING_HUB_AUTH_ENABLED=true` (requires database mode) and register at `/signup`. Authentication is local: scrypt password hashing from `node:crypto`, opaque session tokens stored as digests, no external service.

Personal data is owned by `user_id` and isolated by PostgreSQL row level security — enabled *and* forced, so even the connecting role cannot read across accounts. Isolation is proven by 13 integration tests that run against a real PostgreSQL in CI; the build fails if they skip. See `docs/adr/001-local-auth-rls.md`.

When database mode is enabled, source-pack imports persist packs, documents and Markdown chunks; attempts persist corrections and update competency strength. In seeded mode, submissions are scored but not stored, and the UI says so.

## Source Packs

No SaaS connectors are used. Put files under `source-packs/`, then create a manifest:

```bash
corepack pnpm ingest source-packs/cours-master-2025
```

The web app also exposes a local upload flow under `Documents` and a librarian search under `Apprendre`.

Docling worker conversion:

```bash
docker compose run --rm ingestion-worker python worker.py /app/source-packs/cours-master-2025 --out /app/data/processed/docling
```

## Documentation

- `docs/architecture.md` — runtime boundaries and data strategy
- `docs/adr/000-baseline.md` — PR-00 baseline decisions
- `docs/adr/001-local-auth-rls.md` — PR-01 local auth, ownership and row level security
- `docs/adr/007-stripe-billing-entitlements.md` — PR-07 Stripe checkout, webhook-driven entitlements, attestations
- `docs/local-runbook.md` — local modes, environment validation, checks (including the Stripe CLI walkthrough)
- `docs/roadmap-pr-plan.md` — PR-00 → PR-07 execution plan
- `docs/source-policy.md`, `docs/secrets.md`, `docs/evals.md`, `docs/learning-design.md`, `docs/deployments.md`

## Production

Apprentissage production is deployed at:

https://finance-learning-hub.vercel.app

Patrimoine is a separate project and must not be replaced from this repo.
