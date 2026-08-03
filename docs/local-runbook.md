# Local Runbook

## Prerequisites

- Node.js 22 LTS exactly (`.nvmrc` is `22`, `package.json` is `22.x`, and CI
  reads the same file).
- pnpm via Corepack — `corepack enable`.
- Docker only for database mode.

## Current Safe Default

The app can run without Docker, without PostgreSQL and without a `.env` file:

```bash
corepack pnpm install
corepack pnpm dev
```

pnpm allows only the native build script needed by the toolchain (`esbuild`);
`sharp` stays explicitly ignored because this application does not use image
optimisation. Do not replace this targeted policy with a blanket approval.

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
| `AI_PROVIDER=openai` without `OPENAI_API_KEY` | used to silently disable the tutor |
| `AI_PROVIDER` set to anything but `none`/`openai`/`ollama` | not implemented in `packages/ai` |
| A boolean flag set to `1`, `TRUE`, `yes`… | only `true`/`false` are read; anything else silently meant `false` |
| `LEARNING_HUB_AUTH_ENABLED=true` without database mode | accounts and sessions are rows in PostgreSQL |
| `FINANCE_HUB_BILLING_ENABLED=true` without accounts | an entitlement is a row owned by a user; there would be nowhere to record a payment |
| `FINANCE_HUB_BILLING_ENABLED=true` without key or webhook secret | checkout would 500 on click, or every event would fail verification |
| `FINANCE_HUB_BILLING_ENABLED=true` with no price id | a plan with nothing to charge renders a button that cannot work |
| `STRIPE_SECRET_KEY` starting with `pk_` | a publishable key in the secret slot cannot authenticate anything |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starting with `sk_` | a secret key in a public variable ships to the browser |
| `STRIPE_WEBHOOK_SECRET` not starting with `whsec_` | the wrong secret rejects every delivery, silently granting nothing |
| A live `sk_live_` key outside production | test/live mismatches drop every webhook; the failure is invisible until someone complains |

## Accounts

```text
FINANCE_HUB_USE_DATABASE=true
DATABASE_URL=postgresql://finance:finance_dev_password@localhost:5432/finance_hub
LEARNING_HUB_AUTH_ENABLED=true
```

Then `pnpm db:migrate`, `pnpm db:seed`, and register at `/signup`. Passwords are
hashed with scrypt from `node:crypto`; sessions are opaque tokens whose digest is
stored in `user_sessions`. No external service is contacted.

Personal data — attempts, corrections, revisions, the error journal, exam runs,
business-case attempts, competency progress and flashcard schedules — is owned by
`user_id` and protected by PostgreSQL row level security. The application sets
`app.current_user_id` per transaction; policies compare against it, and an unset
value matches nothing, so the default is deny.

With accounts enabled, the document administration area (Documents, Source
packs) can be restricted to a comma-separated list of e-mails:

```text
LEARNING_HUB_ADMIN_EMAILS=vous@exemple.fr
```

Unset, every account of the private install sees the area — the historic
behavior. The public demo never shows it, and the routes themselves stay
reachable by URL either way; only the navigation entry is role-gated.

With a database but **no** accounts, write routes answer `409`: a row would have
no owner and the policy would reject it. That is deliberate — see
`docs/adr/001-local-auth-rls.md`.

### Proving isolation locally

```bash
RLS_TEST_DATABASE_URL=postgresql://finance:finance_dev_password@localhost:5432/finance_hub \
  corepack pnpm exec vitest run packages/db/test/rls.integration.test.ts
```

Without that variable the suite **skips** and prints a warning saying isolation was
not verified. CI sets it and fails the build if the warning appears.

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
FINANCE_HUB_USE_DATABASE=true
DATABASE_URL=<private postgres pgvector url>
```

## Stripe Billing

Off by default. With `FINANCE_HUB_BILLING_ENABLED=false` — or with any part of
the Stripe configuration missing — **every module is open**, including the Excel
lab and the attestations. The gate exists only where billing exists, so cloning
this repo never produces a paywall in front of your own content.

### What is sold, and what unlocks it

| Feature | Gated surface |
|---|---|
| `excel-finance-lab` | `/modules/excel-finance-lab`, its levels, its exercise pages, and `POST /api/exercises/attempts` for any lab exercise |
| `completion-certificate` | issuing an attestation through `POST /api/certificates` |

Both plans (`founder-annual`, `pro-monthly`) grant both features; the choice is a
billing cadence, not a feature matrix. The mapping from an exercise to the
entitlement it needs lives in `packages/domain/src/modules.ts`, so the page and
the submission endpoint cannot drift apart.

### Stripe events actually handled

| Event | Effect |
|---|---|
| `checkout.session.completed` | links the Stripe customer to the account; grants the plan's features **without an expiry** when `payment_status` is `paid` or `no_payment_required` |
| `customer.subscription.created` | upserts the subscription; grants with `current_period_end + 24 h` when the status is `active` or `trialing`, revokes otherwise |
| `customer.subscription.updated` | same rule — this is what re-opens access after a recovered payment and closes it on `past_due` |
| `customer.subscription.deleted` | revokes every entitlement tied to that subscription, and stores the status as `canceled` |
| `invoice.paid` | moves the expiry forward for the referenced subscription when the invoice line carries a period end; never touches the subscription row |

Anything else is answered `200` and ignored. Subscribe the endpoint to exactly
these five in the Stripe dashboard.

Activation and revocation are decided by one pure function,
`mapBillingEvent` in `packages/domain/src/billing-events.ts`, and applied by
`applyBillingIntent` in `packages/db/src/billing-repository.ts`. **No other code
path writes an entitlement**, and in particular `/billing/success` does not:
it reads what the webhook wrote and reports it.

### First local run

1. Install the Stripe CLI and sign in:

```bash
stripe login
```

2. In test mode, create a product and a recurring price, then copy the price id
   (`price_…`) into `.env`. The dashboard works too; the CLI is faster:

```bash
stripe prices create --currency=eur --unit-amount=24000 --recurring.interval=year -d "product_data[name]=Finance Learning Hub — Fondateur"
```

3. Start the forwarder. It prints the `whsec_…` secret **for this session** —
   it is not the same value as the deployed endpoint's:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. Fill `.env`, then start the app:

```text
FINANCE_HUB_USE_DATABASE=true
DATABASE_URL=postgresql://finance_app:finance_app_dev_password@localhost:5432/finance_hub
LEARNING_HUB_AUTH_ENABLED=true
FINANCE_HUB_BILLING_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_FOUNDER_ANNUAL=price_...
```

5. Apply the billing tables and boot:

```bash
corepack pnpm db:migrate
```

### Step-by-step verification

1. **The gate is on, and not only on the page.** Sign in, open
   `/modules/excel-finance-lab`: the levels are replaced by "réservé aux
   abonnés". Then post a lab answer directly and confirm the API refuses it with
   `402`, so the paywall is not a client-side decoration:

```bash
curl -i -X POST localhost:3000/api/exercises/attempts -H 'Content-Type: application/json' -d '{"exerciseId":"ex-xl-chiffre-affaires","submission":{"kind":"spreadsheet","cells":{"B12":{"value":600000}}}}'
```

   An unsigned webhook must also be refused under every configuration:

```bash
curl -i -X POST localhost:3000/api/stripe/webhook -H 'Content-Type: application/json' -d '{"id":"evt_forged","type":"customer.subscription.created"}'
```

2. **Checkout is created server-side.** Open `/billing`, click *S'abonner*. The
   browser lands on `checkout.stripe.com`. Pay with `4242 4242 4242 4242`, any
   future expiry, any CVC.

3. **The webhook grants.** The `stripe listen` window shows
   `checkout.session.completed` and `customer.subscription.created` answered
   `200`. `/billing` now lists both features as *ouvert*.

4. **The success page grants nothing.** Sign out, then visit
   `/billing/success?session_id=cs_test_anything`. Nothing opens. This is the
   rule the whole design turns on.

5. **Simulate events without paying:**

```bash
stripe trigger checkout.session.completed
```

```bash
stripe trigger customer.subscription.updated
```

   A triggered event carries Stripe's own fixture data, with no `metadata.userId`
   and a price this deployment does not know — so it is answered `200` and
   recorded in `billing_events` with `outcome = 'unresolved'` or `'ignored'`.
   That is the correct outcome, not a failure: a subscription created outside
   this app has no learner to grant it to. To exercise a *real* grant, go
   through checkout as in step 2.

6. **Revocation.** In the dashboard, cancel the subscription immediately.
   `customer.subscription.deleted` arrives, `/billing` flips both features to
   *fermé*, and the lab shows the paywall again.

7. **Attestation.** Finish a track, then open `/attestations`. With the
   entitlement active the button issues one serial; clicking again returns the
   same one rather than minting a second.

### Inspecting what happened

```bash
psql "$DATABASE_URL" -c "select stripe_event_id, type, outcome, detail, received_at from billing_events order by received_at desc limit 20"
```

`outcome` is one of `received`, `granted`, `revoked`, `ignored`, `unresolved`,
and `detail` carries the reason the mapper returned — which is how "the payment
went through but nothing opened" gets an answer.

### Rollback

Set `FINANCE_HUB_BILLING_ENABLED=false`. Checkout answers `501`, the webhook
answers `503` — so Stripe keeps retrying and no event is lost — and every gate
opens. Stored entitlements are untouched and take effect again when the flag
comes back.

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
