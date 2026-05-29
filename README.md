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

## Source Packs

No SaaS connectors are used. Put files under `source-packs/`, then create a manifest:

```bash
corepack pnpm ingest source-packs/cours-master-2025
```
