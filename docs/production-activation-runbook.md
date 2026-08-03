# Production activation runbook

This runbook turns the current read-only public demo into a private deployment.
It deliberately contains placeholders only: create secrets in the chosen
provider and enter them directly in Vercel or the operator shell, never in Git.

## 1. Prepare the database

1. Create or select separate PostgreSQL databases for Preview and Production.
2. Enable pgvector as the database owner: `CREATE EXTENSION IF NOT EXISTS vector`.
3. Create a constrained `finance_app` role with login, `NOSUPERUSER`,
   `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT` and no replication.
   The helper below performs that setup from two operator-only URLs:

   ```bash
   DATABASE_ADMIN_URL='<owner connection>' DATABASE_URL='<finance_app connection>' \
     corepack pnpm db:configure-app-role
   ```

4. Apply migrations in the repository order `0001` through `0009` and seed the
   catalogue with the owner URL, never the constrained runtime URL:

   ```bash
   DATABASE_ADMIN_URL='<owner connection>' corepack pnpm db:migrate
   DATABASE_ADMIN_URL='<owner connection>' corepack pnpm db:seed
   ```

5. Keep `DATABASE_ADMIN_URL` out of Vercel runtime settings. The deployed web
   app receives only `DATABASE_URL` for the constrained role.

## 2. Configure a private Preview first

Set these Preview-scoped variables in Vercel, with provider-generated values:

```text
FINANCE_HUB_USE_DATABASE=true
DATABASE_URL=<preview constrained connection>
FINANCE_HUB_PUBLIC_DEMO=false
LEARNING_HUB_AUTH_ENABLED=true
AI_PROVIDER=none
FINANCE_HUB_BILLING_ENABLED=false
NEXT_PUBLIC_APP_URL=<preview URL>
```

Confirm Vercel Project Settings selects Node.js 22. The repository’s
`package.json` (`22.x`), `.nvmrc` (`22`) and CI must remain aligned. Push a
branch and verify that the preview build reports Node 22, not Node 24.

Create a first account at `/signup`; no shared credential is configured. Create
two accounts and confirm account B cannot read account A’s progression,
revisions, corrections or certificates. Run the automated proof against a
non-production database before promotion:

```bash
RLS_TEST_DATABASE_URL='<preview constrained connection>' \
RLS_TEST_ADMIN_DATABASE_URL='<preview owner connection>' \
  corepack pnpm exec vitest run --config vitest.integration.config.ts
```

## 3. Add Stripe test mode in Preview

Keep billing off until auth, RLS and the catalogue have passed. Then configure
only Preview-scoped test-mode values:

```text
FINANCE_HUB_BILLING_ENABLED=true
STRIPE_SECRET_KEY=<test secret key>
STRIPE_WEBHOOK_SECRET=<Preview endpoint signing secret>
STRIPE_PRICE_FOUNDER_ANNUAL=<test recurring price>
# optionally STRIPE_PRICE_PRO_MONTHLY=<test recurring price>
```

Create a Stripe test webhook for
`https://<preview-host>/api/stripe/webhook` and subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`

Use a test card through hosted Checkout. Verify the signed webhook is delivered,
the entitlement appears on `/billing`, the Excel lab opens, and
`/billing/success?session_id=anything` does not grant anything on its own. Then
cancel the test subscription and confirm the entitlement closes.

## 4. Validate the preview deployment

Run the non-mutating verifier against the Preview URL:

```bash
corepack pnpm verify:deployment -- https://<preview-host>
```

It checks the homepage, health endpoint, curriculum, both modules, billing and
attestations; it also requires security headers and rejects stack traces, Stripe
secret patterns and PostgreSQL URLs in returned bodies. `/api/health` is public
by design and returns only `status`, `mode` and `available`; no administrator
diagnostic route exists because the application has no administrator role model.

## 5. Promote to Production

Repeat the database preparation for Production, then add Production-scoped
values with a different constrained database role and Stripe **live** values.
Set the canonical production `NEXT_PUBLIC_APP_URL`, keep accounts enabled, and
replace the Preview webhook with a Production webhook endpoint and its matching
signing secret. Do not share Preview and Production databases, prices, webhook
secrets or API keys.

Before release, run:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e
corepack pnpm verify:deployment -- https://<production-host>
```

## Rollback, rotation and diagnostics

- **Billing rollback:** set `FINANCE_HUB_BILLING_ENABLED=false`. Checkout stops
  and premium gates open; stored records remain intact.
- **Auth rollback:** only after a maintenance window. Do not disable it on a
  database containing private learner data, because production without accounts
  is deliberately public demo mode.
- **Database rollback:** deploy the prior compatible app version first; restore
  a verified database backup only under the provider’s recovery procedure.
  Migrations are forward-only and replayed idempotently, not down-migrations.
- **Secret rotation:** create the replacement in the provider, update the
  matching environment, deploy, validate the webhook and Checkout, then revoke
  the old value. Rotate database credentials by updating the constrained role
  and `DATABASE_URL` together.
- **Diagnostics:** inspect Vercel deployment logs, Stripe webhook delivery logs
  and the operator-only `billing_events` ledger. Never paste a connection string
  or webhook secret into an issue, PR, terminal recording or source file.
