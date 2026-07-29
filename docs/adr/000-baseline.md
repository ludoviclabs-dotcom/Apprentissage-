# ADR 000 — Baseline hardening (PR-00)

Status: accepted
Date: 2026-07-29

## Context

The repo ran and the checks were green, but the baseline made three promises it
did not keep:

1. `pnpm lint` claimed to lint the repo while only covering `apps/web`; the
   packages had never been linted and failed 17 rules once included.
2. Environment configuration degraded silently. `FINANCE_HUB_USE_DATABASE=true`
   without `DATABASE_URL` fell back to seeded data with no signal;
   `LEARNING_HUB_AUTH_ENABLED=true` without credentials locked every request out
   with a permanent 401; `AI_PROVIDER=anthropic` disabled the tutor without
   saying so.
3. Several visible controls did nothing. One button had no handler at all, three
   write forms stayed enabled in public demo and only revealed the 403 after the
   click, and any network failure left a form's buttons permanently disabled
   because `setPending(false)` sat after an unguarded `await`.

## Decision

Keep the existing architecture — Next.js 16 App Router, pnpm workspace, Drizzle,
seeded fallback mode — and fix the baseline instead:

- **One lint surface.** Root `eslint . --max-warnings=0` covers apps, packages
  and scripts. `no-undef` is off for TypeScript (the compiler already reports it);
  test files lint without the type-aware project service since they sit outside
  the packages' `tsconfig` include.
- **One environment contract.** `apps/web/lib/env.ts` parses `process.env` once
  through a Zod schema. Missing configuration is allowed — the app is designed to
  run with no `.env`. Contradictory configuration throws at boot, listing every
  problem at once. `apps/web/lib/features.ts` derives capability flags from it,
  and `runtime-flags.ts` is now a thin adapter over both so there is a single
  source of truth.
- **A disabled control must explain itself.** Every feature that is off carries a
  user-facing `reason`; `FeatureNotice` renders it before the click. Controls for
  unimplemented features are `disabled` with a "Bientôt disponible" badge rather
  than silently inert.
- **A form can never strand the user.** All browser→route-handler calls go
  through `apps/web/lib/api-client.ts`, which always resolves and always carries a
  displayable message.
- **Runtime configuration is read at runtime.** The root layout is
  `force-dynamic`. Pages were statically prerendered, so `getRuntimeFlags()` was
  evaluated at build time: a production build made with `FINANCE_HUB_PUBLIC_DEMO`
  unset served the demo with the banner absent, the status pill reading "Données
  locales seedées" and every write control enabled — while the API correctly
  answered 403. The safeguard existed only on the server half.

## Consequences

- A misconfigured deployment now fails fast at boot instead of serving a
  degraded product that looks healthy. This is deliberate: preview and production
  environments must carry a coherent set of variables.
- `AI_PROVIDER=anthropic` is rejected until `packages/ai` implements it.
- Five pages that existed but had no inbound link (`/apprendre`, `/documents`,
  `/source-packs`, `/corrections`, `/simulations`) are now in the navigation. The
  whole tutor and librarian UI lived on `/apprendre` and was unreachable.
- Playwright is a new dev dependency. `pnpm test` stays unit-only; `pnpm test:e2e`
  builds and boots the app on port 3100.

## Not in this PR

Deliberately left for later PRs, and tracked in the PR-00 summary:

- Write routes `POST /api/exercises/attempts` and `POST /api/learning/diagnostic`
  are not gated by the public-demo guard. They are harmless while persistence is
  off (they write nothing) and gating them would break the demo's main loop.
  Ownership in PR-01 is the right place to fix this.
- In seeded mode, review/attempt/diagnostic submissions compute a result but
  persist nothing. The UI now labels this instead of hiding it; real persistence
  belongs to PR-01/PR-02.
- `startExam` inserts a new session row on every click when the database is
  active, so `/annales-concours` accumulates duplicates.
- The exam duration is displayed but no timer exists; the copy now says so.
