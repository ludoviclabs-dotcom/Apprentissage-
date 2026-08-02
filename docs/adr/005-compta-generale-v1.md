# ADR 005 — Comptabilité générale v1, the first finishable track (PR-05)

Status: accepted
Date: 2026-08-02

## Context

Twelve `compta-generale` exercises already existed in `compta-v1.ts`. None of
them was usable as a product:

1. **Every one graded through `legacy_rubric`.** They are prose questions with
   `{ label, points }` rubrics and no authored specification, so PR-03's typed
   evaluators never touched them — the word matcher did. The engine built to make
   scores defensible was, in practice, unreachable.
2. **The typed engine was unreachable *anywhere* without PostgreSQL.**
   `getActiveExerciseVersion` returned `null` when `canUseDatabase()` was false,
   and `gradeSubmission` short-circuited before even calling it. Local
   development, the public demo and the default Playwright project all fell back
   to the rubric matcher, so no E2E test could observe a typed mark.
3. **The topics a beginner actually meets were missing.** Nothing covered VAT,
   purchases and sales, the bank, or a fixed asset. The existing content jumps
   to securities, bond issues and capital variations.
4. **Answering an exercise moved no progression.** Mastery events existed only
   behind an API that nothing in the product called.

## Decision

### Fourteen exercises, each with a specification

`packages/domain/src/compta-generale-v1.ts` holds the content. Every exercise
ships an `AuthoredExerciseVersion`, so nothing in this module falls back to the
rubric matcher — a property asserted by test rather than by intention.

Three evaluators carry the module: `journal_entry` for the seven entries,
`numeric` for the five calculations, `multiple_choice` for the two concept
checks. No new evaluator was written; the brief was to reuse them, and none of
this content needed anything they do not already do.

Amounts are small and round because the exercise is the accounting treatment,
not the arithmetic — 60 pneus at 20,00 € rather than a figure whose only
difficulty is a long multiplication.

**The golden cases are the specification.** Each exercise ships a perfect case
and at least one failing case built from a named misconception: the payable
recorded net of VAT, the avoir posted like an invoice, 44566 used where 44562
belongs, the full-year annuity where a prorata is due. Five of my hand-computed
expected scores were wrong, and the existing golden-case runner caught all five
before any of this shipped. That is precisely what they are for.

### One track, two levels, added rather than edited

`track-compta-generale-v1` is a new track in the existing curriculum version.
Enrolment is per `(user, track)` and pins a version, so adding a track leaves
every learner mid-way through the provisions track exactly where they were.
Editing the existing track's levels would have re-graded them.

Two competencies are added, `cg-tva` and `cg-immobilisations`.
`cg-operations-courantes` is reused rather than duplicated: splitting one skill
across two ids makes progression on it unreadable.

### The authored catalogue resolves without a database

`getActiveExerciseVersion` now falls back to `authoredExerciseVersions` when
`canUseDatabase()` is false, and `gradeSubmission` no longer guards the call.
`authoredExerciseVersions` is committed content with exactly the standing of
`exercises` and `module_levels`, both of which already fall back to their seeded
arrays.

This is the change that makes the module demonstrable at all: the typed
evaluators now grade identically in the public demo, in local development and in
CI, and `tests/e2e/compta-module.spec.ts` can assert a mark of 9,23/20 for an
inverted entry — an assertion that could not have been written before.

### Grading feeds progression

`submitAttempt` records a `direct` mastery event against the exercise's level.
Deliberately *outside* the transaction that stores the attempt, and deliberately
non-fatal: a missing level means the database predates this curriculum, which is
real for anyone who migrated without re-seeding, and refusing a correctly graded
answer over an analytics row is the wrong trade. The outcome travels back as
`progress: { attributed, levelId, reason }` so "progression did not move" is
visible rather than mysterious. Because the request still succeeds there is no
retry, and therefore no duplicate event.

### A journal, not an accounting editor

`JournalEntryForm` is a controlled table of `{ compte, libellé, débit, crédit }`.
No account lookup, no auto-balancing, no VAT computed for the learner — each
would do the part of the work the exercise is asking about, and a grid that
balances itself cannot tell anybody they made an unbalanced entry.

It does show running totals and whether débit equals crédit, because that is a
property of the entry the learner can already see on their own page. It also
accepts `1 200,00`: refusing the format the statement uses would fail somebody
for transcribing a figure correctly.

### The mini-case is the drills, in order

Five of the fourteen exercises share one narrative — the SARL Vélo Cité in March
— and those five, plus the VAT liquidation, are the case. The steps are the same
exercise ids, the same specifications, the same evaluators.

Authoring a parallel set of case-only questions was the alternative and was
rejected: it is a second syllabus to maintain, and a learner who has done the
drills should recognise the transactions when they meet them as a month's work.
It also means the case feeds progression and the review queue exactly as the
drills do, with no separate plumbing.

The case closes on a VAT declaration the entries imply, and a test asserts the
closing figures reconcile — a month that "closes" on a number nothing produced
would be theatre.

## Consequences

### The form is not gated on `writes`

`/api/exercises/attempts` has no public-demo guard — unlike
`/api/revisions/review` — so grading works in the demo and only storage is
absent. Disabling the submit button there would refuse something that works,
which is the same dishonesty as an enabled control that does nothing. The form
shows the persistence reason instead. This inconsistency between the two write
routes is pre-existing and left alone rather than resolved here.

### What is deliberately not done

- **The twelve older `compta-generale` exercises still use `legacy_rubric`.**
  Migrating them is a content job of the same size as this module and would have
  doubled the change.
- **No general "module" abstraction.** The routes, the level lookup and the
  exercise-to-level map are specific to this track. A second module is what
  should motivate the generalisation, not a guess about one.
- **The mini-case is six pieces and six steps**, not the ten pieces and eight
  entries the roadmap sketched, and it has no cumulative balance sheet at the
  end — the closing check is the VAT declaration. Adding a general ledger view
  is the obvious v2 and needs a ledger model this PR does not introduce.
- **Progression is `direct` events only.** The `retention`, `caseStudy` and
  `explanation` components of the PR-02 weighting are still fed by nothing, so a
  level cannot currently be *cleared* by exercises alone — it can only move. The
  mini-case is the natural source of `caseStudy` and is the first thing to wire.
- **No timed or exam mode**, no certificate, no per-exercise hint system.
