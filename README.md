# Finance Learning Hub

Private local-first learning cockpit for accounting, cost accounting, management control, IFRS/IAS, ISO, fiscalité and finance.

## Run Locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000`.

Local secrets live in `.env`, which is ignored by Git. The default `.env` can keep `FINANCE_HUB_USE_DATABASE=false` until PostgreSQL is running.

Production without auth is treated as a read-only public demo. Uploads and source-pack imports are blocked until auth and a private database are enabled.

## Checks

```bash
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm build
```

## Database

Start PostgreSQL + pgvector:

```bash
docker compose up -d postgres redis
```

Then copy `.env.example` to `.env`, set `FINANCE_HUB_USE_DATABASE=true`, and run:

```bash
corepack pnpm db:migrate
corepack pnpm db:seed
```

When database mode is enabled, source-pack imports persist packs, documents and Markdown chunks; attempts persist corrections and update competency strength.

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

## Production

Apprentissage production is deployed at:

https://finance-learning-hub.vercel.app

Patrimoine is a separate project and must not be replaced from this repo.
