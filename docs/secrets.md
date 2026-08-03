# Secrets and deployment environment

Finance Learning Hub uses local PostgreSQL accounts and opaque server-side
sessions. There is no shared browser credential: private mode requires
`LEARNING_HUB_AUTH_ENABLED=true`, PostgreSQL and an account created through
`/signup` (or by the owner through the application flow).

Never commit a production value, token, password, database URL or webhook
secret. `NEXT_PUBLIC_*` values are bundled into the browser and must therefore
contain only public configuration.

## Environment matrix

| Variable | Local | Preview | Production | Notes |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | optional | preview URL | canonical URL | Public absolute URL for redirects. |
| `FINANCE_HUB_USE_DATABASE` | `false` or `true` | `true` for private preview | `true` | A true value requires `DATABASE_URL`. |
| `DATABASE_URL` | local constrained role | preview constrained role | production constrained role | Runtime connection for the web app. |
| `DATABASE_ADMIN_URL` | migration/seed only | CI or operator only | operator only | Never expose to the web runtime. It owns migrations and creates the constrained role. |
| `FINANCE_HUB_PUBLIC_DEMO` | optional | normally `false` | `false` for private launch | `true` forces read-only demo safeguards. Production without accounts is also treated as a demo. |
| `LEARNING_HUB_AUTH_ENABLED` | `false` or `true` | `true` | `true` | Requires PostgreSQL. Sessions and account records are stored there. |
| `AI_PROVIDER` | `none`, `openai`, or `ollama` | same | same | Only these values are accepted by the environment parser. |
| `OPENAI_API_KEY` | when `AI_PROVIDER=openai` | when used | when used | Server only. |
| `OPENAI_MODEL` | optional | optional | optional | Defaults to `gpt-4.1-mini`. |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | when `AI_PROVIDER=ollama` | only if reachable from Vercel | only if reachable from Vercel | Never use a private local URL in Vercel. |

## Stripe sandbox and live environments

Billing is off by default. Enabling it requires database mode and accounts; the
parser refuses every incomplete combination at boot.

| Variable | Browser? | Required when billing is on | Notes |
| --- | --- | --- | --- |
| `FINANCE_HUB_BILLING_ENABLED` | no | yes | Master switch and rollback lever. |
| `STRIPE_SECRET_KEY` | **no** | yes | `sk_test_` for local/Preview; live keys only in Production. |
| `STRIPE_WEBHOOK_SECRET` | **no** | yes | `whsec_` secret for this exact endpoint and environment. |
| `STRIPE_PRICE_FOUNDER_ANNUAL` | **no** | one price required | Server-side price configuration. |
| `STRIPE_PRICE_PRO_MONTHLY` | **no** | one price required | Server-side price configuration. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | yes | no | Optional with hosted Checkout; it may only contain a `pk_` key. |

Price IDs remain server-side because Checkout accepts a plan key and resolves the
price there. A user cannot select a price by changing a browser request.

## Vercel handling

Set secrets in Vercel Project Settings with the narrowest environment scope.
Use separate Preview and Production database credentials, Stripe test/live
credentials, and webhook endpoint secrets. `vercel env pull` writes a local
file: keep that file ignored and never copy it into Git.

The detailed owner procedure, validation and rollback steps are in
[`production-activation-runbook.md`](production-activation-runbook.md).
