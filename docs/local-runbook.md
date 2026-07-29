# Local Runbook

## Prerequisites

- Node.js `>=22` (`.nvmrc` pins 22, the version CI uses).
- pnpm via Corepack — `corepack enable`.
- Docker only for database mode.

## Current Safe Default

The app can run without Docker, without PostgreSQL and without a `.env` file:

```bash
corepack pnpm install
corepack pnpm dev
```

`.env` is optional. When present, keep:

```text
FINANCE_HUB_USE_DATABASE=false
FINANCE_HUB_PUBLIC_DEMO=false
AI_PROVIDER=none
```

This uses seeded fallback data and avoids external services.

## Environment Validation

`apps/web/lib/env.ts` parses and validates the environment once, at first access.
Missing configuration is fine — contradictory configuration is not, and fails at
boot with every problem listed at once:

| Rejected combination | Reason |
|---|---|
| `FINANCE_HUB_USE_DATABASE=true` without `DATABASE_URL` | used to fall back to seeds silently |
| `LEARNING_HUB_AUTH_ENABLED=true` without user/password | used to lock everyone out with a permanent 401 |
| `AI_PROVIDER=openai` without `OPENAI_API_KEY` | used to silently disable the tutor |
| `AI_PROVIDER` set to anything but `none`/`openai`/`ollama` | not implemented in `packages/ai` |
| A boolean flag set to `1`, `TRUE`, `yes`… | only `true`/`false` are read; anything else silently meant `false` |

## Checks

```bash
corepack pnpm check
```

runs lint, typecheck, unit tests and build. End-to-end smoke tests are separate
because they build and boot the app:

```bash
corepack pnpm exec playwright install chromium   # once
corepack pnpm test:e2e
```

The suite boots the production build on port `3100`, so it does not collide with
a `pnpm dev` session on `3000`. Set `PLAYWRIGHT_BASE_URL` to test an already
running server instead.

## Database Mode

When Docker is installed and available in PATH:

```bash
docker compose up -d postgres redis
corepack pnpm db:migrate
corepack pnpm db:seed
```

Then set:

```text
FINANCE_HUB_USE_DATABASE=true
```

Check readiness:

```bash
curl http://localhost:3000/api/health
```

`database.reachable` must be `true` before importing real source packs.

## Public Demo Mode

Production without auth is treated as a read-only public demo:

```text
LEARNING_HUB_AUTH_ENABLED=false
```

In this mode, write endpoints (uploads, source-pack imports, exams, revisions,
business cases) return `403`, and the matching UI controls render disabled with
the reason shown before the click rather than after it.

To turn production private:

```text
FINANCE_HUB_PUBLIC_DEMO=false
LEARNING_HUB_AUTH_ENABLED=true
LEARNING_HUB_AUTH_USER=<user>
LEARNING_HUB_AUTH_PASSWORD=<strong password>
FINANCE_HUB_USE_DATABASE=true
DATABASE_URL=<private postgres pgvector url>
```

## AI Mode

Local:

```text
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
```

External:

```text
AI_PROVIDER=openai
OPENAI_API_KEY=<secret>
OPENAI_MODEL=gpt-4.1-mini
```

Every tutor response still keeps source citations from retrieval.

With `AI_PROVIDER=none` the tutor answers from the seeded corpus and the UI says
so explicitly. If a configured provider errors, the response falls back to the
same seeded answer and is labelled as a fallback instead of passing for a model
answer.
