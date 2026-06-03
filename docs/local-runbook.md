# Local Runbook

## Current Safe Default

The app can run without Docker or PostgreSQL:

```bash
corepack pnpm dev
```

Keep `.env` with:

```text
FINANCE_HUB_USE_DATABASE=false
FINANCE_HUB_PUBLIC_DEMO=false
AI_PROVIDER=none
```

This uses seeded fallback data and avoids external services.

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

In this mode, upload and source-pack write endpoints return `403`.

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
