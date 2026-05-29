# Secrets And Local Environment

The app is private-first, but the current Vercel deployment is a demo unless auth is enabled.

## Local `.env`

Copy `.env.example` to `.env` and update values locally.

```bash
cp .env.example .env
```

Important variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL + pgvector connection string. |
| `FINANCE_HUB_USE_DATABASE` | Set to `true` to read/write the DB instead of seeded fallback data. |
| `LEARNING_HUB_AUTH_ENABLED` | Set to `true` to require basic auth. |
| `LEARNING_HUB_AUTH_USER` | Basic auth username. |
| `LEARNING_HUB_AUTH_PASSWORD` | Basic auth password. Never commit a real value. |
| `AI_PROVIDER` | `none`, `openai`, `anthropic`, or `ollama`. |
| `OPENAI_API_KEY` | OpenAI key when `AI_PROVIDER=openai`. |
| `OPENAI_MODEL` | OpenAI model name for tutor/corrector calls. |
| `OLLAMA_BASE_URL` | Ollama API URL when local AI is used. |
| `OLLAMA_MODEL` | Ollama model name. |

## Vercel

For a private deployment, set these Vercel environment variables:

```text
LEARNING_HUB_AUTH_ENABLED=true
LEARNING_HUB_AUTH_USER=<your user>
LEARNING_HUB_AUTH_PASSWORD=<strong password>
```

Do not put official course PDFs, private notes, API keys or licensed standard text into public env vars or public assets.
