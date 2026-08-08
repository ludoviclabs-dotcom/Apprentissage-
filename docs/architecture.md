# Architecture

Finance Learning Hub is a private, local-first learning cockpit.

The MVP starts with seeded learning data and a navigable Next.js interface. Document ingestion, RAG and AI agents are represented by stable package boundaries so they can be wired later without changing the user experience.

## Runtime

- `apps/web`: Next.js application.
- `packages/domain`: domains, competencies, exercises, corrections and seeded learning paths.
- `packages/db`: PostgreSQL/pgvector schema, Drizzle table definitions, migration SQL, seed script and repository functions.
- `packages/ai`: provider and agent contracts.
- `packages/ingest`: source pack and document ingestion primitives.
- `workers/ingestion-worker`: Docker boundary for future Docling/Python ingestion.

## Content Pipeline

Since the « Comptabilité approfondie » preparation lot, `packages/ingest`
carries a deterministic content pipeline (`content:scan` → `content:extract` →
`content:pair` → `content:validate`) that turns private sources under
`content-private/` into typed, page-aware JSON artifacts in `data/extracted/`
— both git-ignored. No AI call, no automatic publication. See
`docs/content-pipeline.md`, `docs/content-source-layout.md`,
`docs/content-quality-gates.md` and `docs/content-pipeline-audit.md`.

## Content Factory

`packages/content-generation` turns a validated chapter into *drafts* —
revision sheets, flashcards, calculation and journal-entry exercises, error
diagnoses, progressive cases — and never into published content. The division
of labour is the whole point: the model proposes, Zod enforces the shape, the
code recomputes every figure and every debit/credit balance, and a human
approves. Numbers are never written by the model in a form the code cannot
check: a calculation exercise names a template from a closed, versioned
registry (`src/calc/templates.ts`) and supplies named inputs, so there is no
expression to parse and no `eval` to sandbox.

The editorial machine has five states — `draft`, `validation_failed`,
`needs_review`, `approved`, `rejected` — and deliberately no `published`: the
absence of the state is what makes an accidental publication impossible rather
than merely forbidden. Approving is refused outright while the deterministic
checks fail, and an approved draft is terminal, so regenerating with `--force`
revises everything except what a human already accepted.

Generation has three modes and the boundary that matters is which of them may
ever be published, expressed as a whitelist (`publishableGenerationModes`)
rather than as a list of refusals — so a mode added later is refused until
somebody decides otherwise. `mock` is fixtures anchored on the real corpus,
needs no API key, is what `pnpm test` and `pnpm build` exercise, and is
**permanently unpublishable**. `live` is a model writing from the source
envelope. `manual-assisted` is a draft written from the validated extracts with
no provider call, read from a git-ignored input file, then put through the same
Zod schema, the same deterministic checks and the same human approval as `live`
— it is not a relabelled mock: a fixture is picked by prompt id from a catalogue
compiled into the repo, while an assisted payload is read from a file written
for that chapter, its absence is a failure rather than a fallback, and the
recorded model carries the input file's digest. Three independent barriers cite
that one whitelist — the guard, the store write and the public read — because
three barriers are only worth having if they say the same thing. See
`docs/compta-pilot-activation.md`. `/admin/content-review` shows each draft beside the source text it
cites, its failed checks and its history; it is gated by
`CONTENT_REVIEW_ENABLED` plus the admin role, answers 404 otherwise, and
refuses to boot in production without accounts. See
`docs/content-generation.md`, `docs/content-validation-rules.md`,
`docs/content-review-workflow.md` and `docs/content-factory-preflight.md`.

## Content Publication

The factory produces drafts; `packages/content-publication` is what turns one
into a public page, and — mostly — what stops it. The editorial state machine
still has no `published`: publication is a separate layer, a separate route and a
separate button, so approving cannot publish by accident.

Published snapshots live in `content/published/`, **committed**. That is not a
relaxation of the rule that keeps `data/generated/drafts/` out of git: the rule
exists because nobody knows what a draft contains, and `inspectForPublication`
proves a snapshot carries no private path, no secret, no mock fixture, no dead
source reference and no figure the code cannot recompute. With the proof made,
the prohibition has no object — and three properties follow that no database
could give: the chapter works with no database at all, a publication is reviewed
as a diff before it reaches production, and `pnpm build` touches neither network
nor private file. A version file is never rewritten; `readVersion` recomputes its
hash on every read, so a hand edit fails the read instead of reaching a visitor.

The guard does not trust the stored verdict. `validationMetadata` says what the
checks concluded the day they ran; the guard reloads the corpus and replays
everything at the exact moment of publication — every figure through
`runTemplate`, every entry's balance, every reference against the extracted
corpus. An absent corpus is a refusal, never a default pass, because not being
able to verify is not verifying.

Migration 0014 records the *acts* rather than the content:
`published_content_versions` (one active version per artifact type, chapter and
slug, enforced by a partial unique index rather than by discipline),
`content_publication_audit` (append-only, and deliberately not cascading — an
audit that disappears with what it audits is not an audit), and
`chapter_activity_events`, the one personal table of the lot, under RLS.

Source excerpts do not survive into a snapshot. The published reference names a
document, its nature, its section and its pages — enough to find the passage in
your own copy, and nothing that publishes somebody's PDF. See
`docs/content-publication.md`.

## Normative Versioning

A chart of accounts is a dated text, not a timeless truth, so a piece of course
material is true *according to a referential*. `normativeContext` says which one:
the referential in force (`anc-2026-current`), the original support's treatment
(`course-original`), or a subdivision local to one entity or exercise
(`entity-specific`). It lives on the draft envelope beside `generationMetadata`,
is copied into the published snapshot, and no table was created for it.

The consequence that matters is that grading has a referential. Content marked
`comparison-only` is readable — understanding why a rule changed is part of the
subject — but it corrects no attempt, enters no mastery score, and never reaches
the spaced-repetition queue. The activity route refuses it outright with a 409,
because a screen that filters is a convention and an id copied into a request
walks around it.

Mixing referentials is a blocking refusal (`normative-profile-mismatch`): 481
with 791, 6862 with 6812, a graded exercise whose expected answer uses a
superseded account, a `current` claim citing only the course. Two of those are
refused even with no referential declared — adding two mechanisms that replace
one another is wrong whichever plan you invoke. A closed table of versioned
accounts (`normative-accounts.ts`) carries exactly what the chapter audit
established; anything outside it is out of scope and passes silently. See
`docs/content-normative-versioning.md`.

## Comptabilité approfondie

The first public track fed by the factory, under `/modules/comptabilite-approfondie`
— the existing Modules entry, not a second navigation tree. A chapter is five
tabs resolved from a search parameter, so every sub-section is shareable and
survives a reload: Comprendre, Fiche 2.0, S'entraîner, Réviser, Sources.

Nothing is added to what was validated. A section the snapshot does not fill is a
section that does not render, because inventing a timeline step the sources do
not carry is inventing course material.

Every graded activity is corrected server-side by the PR-03 evaluators — no
second engine, no model call. The public projections strip the expected answer
from the payload, so grading *cannot* happen in the browser and a learner cannot
read the answer in the page source. A test asserts no component under
`components/compta-approfondie/` imports a grader.

Progression is computed from `chapter_activity_events` and nothing else, by a
pure function over seven dimensions. Opening the sheet is one dimension out of
seven and can never on its own exceed "en cours" — reducing mastery to a page
view is exactly what the public-demo audit reproached the older screens with. A
dimension the chapter publishes nothing for is neutral rather than missing. See
`docs/compta-public-learning-experience.md`, `docs/compta-user-progress.md` and
`docs/compta-deterministic-grading.md`.

## Product Rule

The cockpit is organized around guided learning. Retrieval and AI features support the route, but the main user loop is:

1. diagnose current level;
2. follow the 30-day path;
3. study one concept;
4. answer one exercise;
5. read a structured correction;
6. update competency strength.

## Data Strategy

The app can run in two modes:

- Seeded fallback mode: default, no database required.
- Database mode: set `FINANCE_HUB_USE_DATABASE=true` and `DATABASE_URL`, then run migrations and seed.

Drizzle was chosen over Prisma for the MVP because the schema stays close to PostgreSQL/pgvector SQL, starts lighter in a monorepo, and keeps query code explicit while the domain model is still moving.

Current persistence coverage:

- source packs and documents;
- document pages and Markdown chunks during source-pack import;
- learning path, learning days, lessons and lesson source references;
- exercises loaded from DB when enabled;
- attempts and corrections;
- competency strength updates after correction or diagnostic;
- revision items scheduled after exercise correction;
- the active review queue, its attempt log and the remediation a failure opens.

The next persistence gap is durable user profiles and cohort-level analytics.

## Active Review

Review is a queue of due items, not a list of cards. `packages/domain/src/review-scheduler.ts` holds the whole algorithm: one fixed interval per self-assessment (1 / 3 / 7 / 14 days), a total order over the queue, and the rule that a forgotten item opens exactly one remediation task dated on its own retest. It is pure, so the schedule is reproducible in a unit test and explainable to the learner.

An item is `(item_type, item_ref)`, pointing at either a flashcard or an exercise, which is what lets a failed submission be scheduled for retest alongside the cards. `packages/db/src/review-repository.ts` merges the learner's stored schedule over the seeded catalogue on read, so a new account has a queue and a newly authored card appears without a backfill.

The answer to an item is never part of a queue read. It is fetched from `POST /api/revisions/reveal` when the learner asks, so it is absent from the page source until then. See `docs/adr/004-active-review-scheduler.md` for the reasoning and the assumed limits of this first version.

## Comptabilité générale v1

The first track built to be finished — and, since PR-12a, finished vertically: four published levels running « de la pièce au bilan ». `packages/domain/src/compta-generale-v1.ts` holds N1/N2 (invoice cycle, VAT, bank, fixed asset, six-step mini-case); `packages/domain/src/compta-generale-cloture.ts` holds N3 « Clôture » (CCA/PCA, FNP/FAE, dotations, créances douteuses, stocks, rapprochement, contrôle de TVA, balance après inventaire) and N4 « Révision et états financiers » (feuilles maîtresses, contrôles de cohérence, revue de cycle, bilan, compte de résultat, annexe, événements postérieurs, comparaison PCG/IFRS). Every exercise ships an authored specification, so nothing in the module is graded by the rubric matcher — asserted by test, not by intention.

N3/N4 share one dataset: the closing balance of the SARL Vélo Cité and its inventory entries. Ledger, trial balance, income statement, balance sheet, control sheet and lead schedules are pure derivations, and every figure an N4 statement cites is a constant asserted equal to the derived value. Two case studies (monthly closing, annual closing) reuse level exercises as steps — submitted with `activityContext: "case_study"`, the last step doubling as the level diagnostic. The web tools (`apps/web/components/tools/`) render these derivations as working papers; case pages hide any figure that is itself an expected answer, the same no-leak rule the N2 mini-case enforces on its VAT closing. Source references resolve against seeded catalogue assets via `resolveSourceReference` — pack, document and page bounds — so no citation can name a phantom referentiel.

The ten learning-path exercises that still graded through `legacy_rubric` are migrated in `packages/domain/src/parcours-migrations.ts`, expectations extracted from their own corrigés; the generic `/exercices` pages render whichever form the active specification demands.

`getActiveExerciseVersion` resolves `authoredExerciseVersions` when there is no database, which is what makes the typed evaluators grade identically in the public demo, locally and in CI. Before that they only ran against a seeded PostgreSQL.

Submitting a module exercise records a `direct` mastery event against its level, so answering a question moves progression. It cannot fail a submission: the outcome is reported as `progress.attributed` rather than raised. See `docs/adr/005-compta-generale-v1.md`.

## Excel Finance Lab

A finance lab built on spreadsheet reasoning, four levels deep since PR-12b. N1/N2 keep the PR-06 contract — `packages/domain/src/evaluators/spreadsheet.ts` checks a typed-in result and whether the formula's *text* matches an authored pattern, nothing recalculated. N3/N4 are graded by a bounded formula engine, `packages/domain/src/spreadsheet/`: a closed grammar (`+ - * / ()`, comparisons, A1 references and ranges, absolute references, SUM/AVERAGE/MIN/MAX/IF/SUMIF/SUMIFS with their French aliases normalised onto one canonical AST), error values (`#DIV/0!`, `#REF!`, `#VALUE!`, `#NAME?`, `#CYCLE!`, `#LIMIT!`), a static dependency graph with cycle detection, and deterministic full recalculation under counted step budgets. No dependency was added for it, and a test asserts the engine's source contains no dynamic-execution or I/O primitive — `eval` and its relatives are absent by grammar, not by discipline.

The `spreadsheet_formula` evaluator executes the learner's formula instead of reading it: 60% for the result over the given data, 40% for a method that survives the data changing — every checked cell must be covered by at least one authored *perturbation* (overridden givens plus the value a correct method then produces), which is what catches a hard-coded figure without any pattern. Reference and function constraints (required or forbidden) express the rest. Chained cells are graded in isolation against the expected values of their neighbours, so one mistake costs its own points exactly once. The same engine runs the browser grid (`FormulaGridView`: formula bar, keyboard navigation, protected cells, dependency highlighting, per-cell errors, a deferred-value "recalcul en cours" state), so what the learner sees is what the grader computes.

Value and method stay separate criteria on every level, so a right figure hard-coded scores partial marks and is reported as a method error rather than an arithmetic one. Datasets live as committed CSV/JSON in `datasets/excel/` — including the dirty ERP export N3 learns to diagnose (Power Query as guided diagnostics, never executed) and the VBA module N4 learns to read (shown in a locally-bundled Monaco editor, downloadable, never executed); tests parse the files off disk and assert they equal the typed constants, and every expected answer is derived from the datasets in the tests rather than restated. Two case studies — the thirteen-week cash forecast and the Aster Industrie DCF — reuse level exercises as steps under `activityContext: "case_study"`, the last step doubling as the level diagnostic, with the same no-leak rule as the accounting dossiers. With a database active, the learner's grid drafts persist per (user, exercise) in `lab_workbooks` (RLS, migration 0011); grading never reads them.

Module progression is resolved through `packages/domain/src/modules.ts` — one registry mapping an exercise to its curriculum level — so adding a module does not add a branch to the grading path. See `docs/adr/006-excel-finance-lab.md` for the N1/N2 contract and `docs/adr/009-excel-formula-engine.md` for the engine's exact limits and licence decisions.

## Billing and Entitlements

Payment is off by default, and off means *ungated*: with no Stripe configuration
every module is open, because a private local-first install has no customer and a
paywall in front of your own lab would be absurd. `FINANCE_HUB_BILLING_ENABLED`
is both the switch and the rollback lever.

When it is on, access is a row in `entitlements`, and the only writer is
`POST /api/stripe/webhook` after `Stripe.webhooks.constructEvent` has verified
the signature. `/billing/success` reads that state and reports it; it never
grants, and it never reads its own `session_id`. The decision itself is one pure
function — `mapBillingEvent` in `packages/domain/src/billing-events.ts` — so
"which event grants what, and until when" is unit-testable without a network,
and `apps/web/lib/billing/webhook.ts` is the single place that knows where
Stripe puts a field in the pinned API version.

Grants expire on their own at `current_period_end` plus a day, so a webhook that
never arrives costs one period of access rather than costing it permanently. The
gate itself hangs off `packages/domain/src/modules.ts`: the registry that maps an
exercise to its level also names the entitlement it needs, so the module page,
the level page and the submission endpoint cannot disagree about what is locked.

Since PR-13 a learner manages their own subscription: `POST /api/stripe/portal`
opens Stripe's hosted customer portal for the caller's own customer id, read
from `billing_customers` — the body carries nothing, so it cannot name somebody
else's. It grants nothing either; a change made there reaches the application
through the same signed webhook as everything else. Each Stripe status is also
classified rather than merely filtered (`classifySubscriptionStatus`): the gate
stays the two-value question it was, while the learner is told whether the fix
is a card update, a new subscription or finishing a payment.

Attestations are the other half. A completion certificate is issued once per
track, from the same PR-02 snapshots the level track renders, and only while the
entitlement is active — but once issued it stays valid, because it records
something that happened rather than granting access to anything.

PR-13 makes it a real document. `apps/web/lib/certificates/pdf.ts` renders a
server-side PDF with `pdf-lib` and draws a QR code from `qrcode-generator`'s
module matrix — both MIT, neither needing a font file, a native binary or a
network call, which is what lets the offline commitment survive the reversal of
ADR-007's "no PDF" decision. Everything printed is frozen into
`certificates.content_json` at issue time, so a document cannot change under its
holder; the curriculum it cites is the learner's *pinned* version, and case
studies are listed as "travaillés" because case-study evidence on a level is
what the schema actually records.

Verification is public and deliberately thin. `/verify/[certificateId]` reads
`certificate_verifications`, a projection with no `user_id`, no e-mail, no score
and no revocation reason — the private `certificates` table stays under RLS and
is never touched by that page, so the absence of a leak is structural rather
than a matter of writing careful queries. The identifier behind the QR code is
160 bits of CSPRNG in Crockford base32, distinct from the human-readable serial,
which carries too little entropy to guard a public URL. Revocation writes the
projection and an internal `certificate_revocations` trail; the reason is never
published, and `superseded` is kept distinct from `revoked` so re-issuing after
a curriculum change does not read as an accusation. See
`docs/adr/007-stripe-billing-entitlements.md` and
`docs/adr/010-certificates-and-billing-portal.md`.

## Navigation and Shells

PR-09 split the chrome in two. `PublicShell` serves the public demo and
signed-out visitors when accounts are on: product presentation, access to the
demo content, sign-in and sign-up, no administration area, no personal
branding and no seeded number presented as a personal score. `AppShell` serves
an identified user — a signed-in account, or the owner of a private install
without accounts — with the grouped learning navigation, personal indicators
and the account menu. `apps/web/app/layout.tsx` picks the shell; both compose
the same primitives (`SidebarNav`, `Topbar`, `MobileNav`).

The information architecture is one data structure,
`apps/web/lib/navigation.ts`: five primary destinations (Accueil, Apprendre,
S'entraîner, Réviser, Progression) with sub-sections, plus a role-gated
Administration area for Documents and Source packs. The contextual topbar is
resolved from `apps/web/lib/topbar.ts` (section, title, breadcrumb, search) so
a route cannot disagree with its own header. Roles come from
`apps/web/lib/auth/roles.ts`, derived from runtime configuration —
`LEARNING_HUB_ADMIN_EMAILS` restricts the administration area when accounts
are enabled; without the list every account of the private install
administers, and the public demo never does. No progression table changed.
Hidden never means removed: every historic URL keeps answering, and
`/modules` is the only new route (the landing page of the Modules entry).

Active state is resolved by `isNavItemActive`, which lights the *most specific*
entry covering the route: `/revisions/carnet-erreurs` marks the error journal,
not "Session du jour", and `/exercices/session-decouverte` — which has no entry
of its own — marks "Exercices". Prefix matching alone lit both, and announced two
current pages to a screen reader.

User-facing statuses are localized once in `apps/web/lib/status-labels.ts`;
the raw model values (`done`, `today`, `mastered`, …) must not reach a screen.
The same rule applies to configuration: an unavailable capability carries a
`publicMessage` written for the visitor (`apps/web/lib/availability.ts`), while
the variables an operator must set live in `availability-diagnostics.ts` behind
`server-only`. `FeatureState` has no operator-facing field, so a diagnostic
cannot be passed to a Client Component and hidden — see
`docs/adr/011-public-discovery-mode.md`.
Below 1120 px the sidebar is replaced by a compact header and a modal drawer
with a focus trap — never by a horizontal strip of tabs.

## Public Demo Safeguard

Production without auth is read-only by default. The app shows a demo banner and blocks write routes for uploads and source-pack imports. Private mode requires auth plus a private database.
