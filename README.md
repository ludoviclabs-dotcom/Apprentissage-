# Finance Learning Hub

Private local-first learning cockpit for accounting, cost accounting, management control, IFRS/IAS, ISO, fiscalité and finance.

## Run Locally

```bash
corepack pnpm install
corepack pnpm dev
```

Open `http://localhost:3000`.

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

## Source Packs

No SaaS connectors are used. Put files under `source-packs/`, then create a manifest:

```bash
corepack pnpm ingest source-packs/cours-master-2025
```

## Production

Apprentissage production is deployed at:

https://finance-learning-hub.vercel.app

Patrimoine is a separate project and must not be replaced from this repo.
