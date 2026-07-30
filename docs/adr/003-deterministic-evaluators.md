# ADR 003 — Deterministic evaluators per exercise family (PR-03)

Status: accepted
Date: 2026-07-30

## Context

There was one grading strategy for all 35 seeded exercises: normalise the answer,
then count how many words drawn from the rubric criterion's own **label** appear
as substrings, and award points in four bands from that ratio.

It could not work, because `RubricItem` is `{ label: string; points: number }` and
`Exercise.expectedAnswer` is prose. Nothing in the data model held a checkable
expectation, so the matcher had to invent one from the wording of the question.

The failures were measured against the shipped grader, not hypothesised:

| Case | Old engine |
|---|---|
| `ex-ias37-comparison` graded on **its own model answer** | **3/20** |
| `ex-provision-litige` graded on its own model answer | 10/20 |
| Reversed debit/credit on `ex-ecriture-provision-simple` | **20/20** |
| The *correct* entry, written with account numbers | 0/20 |
| `13 000` where `14 000` is expected | identical to the right answer |
| All four MCQ answers wrong on `ex-yield-management-1`, with parroted vocabulary | **20/20** |
| All four correct, written as `Q1 : c. Q2 : b. …` | 0/20 |
| Pasting the **question** into the answer box | 20/20 on three exercises, ≥16 on fifteen |

The mechanism, for the record: `genericCriterionTerms` split on `[^A-Za-z0-9]+`
*before* stripping accents, so French words were shredded (`probabilité` →
`probabilit`, `écart` → `cart`) and numbers with thousands separators were
destroyed (`17 320` → two sub-4-character fragments, both discarded). What
survived were 4+ character ASCII stems, matched with `String.includes`, so `ation`
matched *situation, information, opération*.

## Decision

Each exercise family gets an evaluator that declares the specification it needs,
and an author writes that specification as data.

- **Pure functions.** No clock, no randomness, no I/O. Ids and timestamps are
  stamped by the submission service. The same answer always produces the same
  result, so a stored correction can be recomputed and a test can pin a mark.
- **Selection by authored version, not by `exercise.type`.** The seed makes this
  necessary: `ex-provision-reprise` is typed `journal-entry` but its expected
  answer is prose with no accounts, and the two `qcm` exercises have no options
  field anywhere — their choices live in the statement text.
- **`legacy_rubric` is the migration path**, not a fallback to be embarrassed
  about. An exercise with no active version keeps the previous grader and behaves
  exactly as before. Content moves over one exercise at a time.
- **`legacy_rubric` is absent from the registry.** It needs the whole `Exercise`
  rather than a spec, so it cannot satisfy the `Evaluator` interface; keeping it
  out means nothing new can be authored against it by accident.

### Scoring decisions worth naming

- **Multiple choice.** `ratio = hits/|correct| − falsePositives/|incorrect|`,
  floored at zero. Measuring the penalty against the number of *distractors* is
  what makes "tick every box" score exactly zero for any question. Scoring it
  against `|correct|` instead leaves a residue whenever there are fewer
  distractors than answers. The consequence is deliberate and sharp: on a
  three-of-four item, choosing the distractor cancels two correct picks, because
  that distractor is the misconception the item exists to detect.
- **Journal entries** are scored on four separate criteria — accounts, direction,
  amounts, balance — because those are four different mistakes and the learner
  needs to know which one they made. A magnitude posted to the **wrong side does
  not earn amount points**: crediting it let a wholly reversed entry keep 15.4/20,
  which is three quarters of the marks for the one error double-entry exists to
  catch. The feedback still separates the two, so nobody is told their amount is
  wrong when it is not.
- **Numeric** tolerance is explicit, relative and/or absolute, and passes if
  either declared bound is satisfied. `parseNumericAnswer` accepts French
  formatting (comma decimal, space and non-breaking-space thousands separators)
  and **refuses** anything else rather than coercing it — reading `12,5 %` as
  `12.5` euros would be a false positive.
- **Short text** is still keyword matching and cannot judge an argument. What
  changed is that the accepted formulations are authored rather than lifted from
  the criterion label, a criterion may declare disqualifying formulations, and
  each criterion states which error category a miss belongs to.
- **Money is compared at the precision of money.** `|100 − 100.01|` is
  `0.010000000000005` in IEEE-754, so an entry exactly one cent apart failed a
  one-cent tolerance until the difference was rounded before comparison.

### The `Correction` contract is unchanged

`Correction` has sixteen required fields and every one has a reader: the
correction panel, the error journal (`errorJournalTable.category` is populated
exclusively from its five error arrays), competency strength, the revision
scheduler. `toCorrection` fills all sixteen. Two details are load-bearing and
covered by tests: criterion labels must be unique because the panel keys rows on
them, and `errors` is the *legacy* pane — the panel renders it only when every
structured category is empty, so it is filled as a mirror rather than in addition.

### Golden test cases

`exercise_test_cases` lets an author ship the expected behaviour of their own
exercise. A specification edit that changes a mark fails a test instead of
silently re-grading learners. A migrated exercise with no golden case is rejected
by `assertValidAuthoredVersions`.

The test that matters most pins the **old** engine's behaviour on the same inputs.
Those assertions are not aspirational — they are what it still does, and they are
why these exercises were migrated first.

## Migrated so far

| Exercise | Family | Was |
|---|---|---|
| `ex-ias37-comparison` | `short_text_rubric` | model answer scored 3/20 |
| `ex-ecriture-provision-simple` | `journal_entry` | reversed entry outscored the correct one |
| `ex-provision-qcm-conditions` | `multiple_choice` | selecting the distractor scored full marks |
| `ex-provision-calcul-fourchette` | `numeric` | 13 000 scored the same as 14 000 |

The remaining 31 exercises stay on `legacy_rubric`.

## Not in this PR

1. **31 exercises unmigrated.** The four above were chosen because each
   demonstrates a distinct, reproduced defect. Authoring the rest is content work.
2. **No exercise-type-specific UI.** The API accepts typed submissions, but the
   form still posts free text, so a learner cannot yet tick boxes or enter journal
   lines. Until the UI catches up, a migrated exercise is only reachable in its own
   terms through the API — which is how the e2e tests drive it.
3. **Composite exercises have no home.** `ex-examen-court-provisions` and
   `ex-provision-litige` mix text, a number and an entry in one rubric. No single
   family fits; they need either a composite evaluator or splitting into parts.
4. **Variance exercises need a qualifier.** `ex-ecarts-1/2` and `ex-cout-cible-2`
   expect a signed amount *plus* `FAVORABLE`/`DÉFAVORABLE`. Plain numeric equality
   does not express that.
5. **No mastery event is emitted yet.** PR-02 left this as the handoff:
   `toPercent(score, 20)` converts a mark, but nothing maps an exercise to a level,
   so the submission service cannot know which level to credit. That mapping is
   PR-05's work.
6. **`attempts.evaluation_type` has no CHECK constraint.** PostgreSQL has no
   `ADD CONSTRAINT IF NOT EXISTS`, and every migration in this repo is replayed on
   each run, so a table constraint there could not be idempotent.
7. **The legacy grader still stamps `Date.now()`** into its correction id and is
   therefore not a pure function. It is untouched on purpose; the new path uses
   `randomUUID()`.
