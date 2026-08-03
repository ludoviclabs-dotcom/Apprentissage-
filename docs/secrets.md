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
| `FINANCE_HUB_PUBLIC_DEMO` | Set to `true` to force read-only public demo safeguards. Production without auth is treated as public demo automatically. |
| `LEARNING_HUB_AUTH_ENABLED` | Set to `true` to require basic auth. |
| `LEARNING_HUB_AUTH_USER` | Basic auth username. |
| `LEARNING_HUB_AUTH_PASSWORD` | Basic auth password. Never commit a real value. |
| `AI_PROVIDER` | `none`, `openai`, `anthropic`, or `ollama`. |
| `OPENAI_API_KEY` | OpenAI key when `AI_PROVIDER=openai`. |
| `OPENAI_MODEL` | OpenAI model name for tutor/corrector calls. |
| `OLLAMA_BASE_URL` | Ollama API URL when local AI is used. |
| `OLLAMA_MODEL` | Ollama model name. |

## Stripe (PR-07)

Billing is off by default, and off means every module is open — see
`docs/local-runbook.md` for the full setup and `docs/adr/007-stripe-billing-entitlements.md`
for why. Only one of these may ever reach a browser.

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `FINANCE_HUB_BILLING_ENABLED` | server | no (default `false`) | Master switch and rollback lever. `true` requires accounts, a key, a webhook secret and one price. |
| `STRIPE_SECRET_KEY` | **server only** | when billing is on | API key. Must start with `sk_`/`rk_`; a live key is refused outside production. |
| `STRIPE_WEBHOOK_SECRET` | **server only** | when billing is on | `whsec_…` signing secret. Different per endpoint: the `stripe listen` value is not the deployed one. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | no | The only Stripe value allowed in the bundle. Unused by the current hosted-Checkout flow. |
| `STRIPE_PRICE_FOUNDER_ANNUAL` | **server only** | one of the two | Price id for the annual plan. |
| `STRIPE_PRICE_PRO_MONTHLY` | **server only** | one of the two | Price id for the monthly plan. |

Price ids are secrets in the sense that matters here: a client that can name a
price can name a cheaper one. They must never be prefixed `NEXT_PUBLIC_`.
`apps/web/lib/billing/plans.ts` imports `server-only`, so a client component that
reaches for one fails the build rather than shipping it.

Use test keys (`sk_test_…`) everywhere except production, and give Preview and
Production separate Stripe values on Vercel. A test key paired with a live
webhook secret fails silently: every delivery is rejected and no access is ever
granted.

## Vercel

The current safe public stance is read-only demo until auth and a private database are configured.

For a private deployment, set these Vercel environment variables:

```text
FINANCE_HUB_PUBLIC_DEMO=false
FINANCE_HUB_USE_DATABASE=true
DATABASE_URL=<private postgres pgvector url>
LEARNING_HUB_AUTH_ENABLED=true
LEARNING_HUB_AUTH_USER=<your user>
LEARNING_HUB_AUTH_PASSWORD=<strong password>
```

Do not put official course PDFs, private notes, API keys or licensed standard text into public env vars or public assets.

Production without `LEARNING_HUB_AUTH_ENABLED=true` blocks upload and source-pack write routes.
