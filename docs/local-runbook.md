# Local Runbook

## Current Safe Default

The app can run without Docker or PostgreSQL:

```bash
corepack pnpm dev
```

Keep `.env` with:

```text
FINANCE_HUB_USE_DATABASE=false
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
