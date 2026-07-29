# ADR 002 — Mastery model and level unlocking (PR-02)

Status: accepted
Date: 2026-07-29

## Context

Progression existed only as `competencies.strength` nudged by `±8/±3/−6` per
attempt, plus a `learning_days.status` column edited by the seed. There was no
notion of a level, no threshold, and nothing that could answer "may this learner
move on?" — so nothing that could be tested.

PR-02 introduces levels with an explicit passing rule. The requirement that
shaped the design is *"les règles doivent être versionnables"*.

## Decision

### Rules are data, pinned per enrolment

`MasteryRules` — the four weights, the passing score, the critical-competency
minimum, whether a final diagnostic is required — is a value loaded from a
`curriculum_versions` row, not a constant beside the scoring function.

`enrollments.curriculum_version_id` is written once per (user, track) and never
moved. Publishing new thresholds therefore cannot re-grade someone mid-track. The
foreign key deliberately does **not** cascade: deleting a version somebody is
enrolled against must fail loudly rather than silently unpin them.

### The scoring core is pure

`packages/domain/src/mastery.ts` contains no I/O, no `Date.now()`, no randomness.
Every function is a total function of its arguments, which is what makes
snapshots safe to recompute and unlock decisions safe to re-evaluate. It is
covered by 48 unit tests with no database and no browser.

Weighted score, on rounded two-decimal arithmetic:

```
score = 0.40·direct + 0.25·retention + 0.20·caseStudy + 0.15·explanation
```

Weights that do not sum to 1 are **rejected**, not normalised: silent
normalisation would let a typo quietly rescale everybody's score.

### Latest wins, and "not started" is not "failed"

A newer result for an activity kind replaces an older one. Mastery is meant to
describe current ability, so averaging would dilute recent progress and taking the
maximum would reward a single lucky run.

A kind with no event contributes zero, but the snapshot also lists it in
`missingKinds`. A level at 40 % because nothing was attempted must not look like a
level at 40 % because everything went badly — the UI shows "non commencé", not
"0 %".

### Critical competencies do not compensate

The global threshold and the per-competency minimum are checked independently. A
level cannot be cleared by offsetting a weak essential with strong optionals. On
the shipped track this is visible immediately: `cg-cutoff` is seeded at 68 so
level 1 is clearable, while `cg-provisions` at 45 keeps level 2 open but
unclearable until it is raised.

### Acquisition is monotonic

`unlock_events` is append-only with `UNIQUE (user_id, level_id)`; the evaluator
reads it back as `alreadyAcquired`. A later dip — a failed retention quiz, a rule
change, a re-seed — cannot re-lock a level already earned. `mastery_snapshots` is
the opposite: a cache of a pure function, keyed on (user_id, level_id) and always
safe to discard and recompute.

The snapshot still reports current blockers honestly while the status stays
`acquired`, so a learner sees that a competency has slipped without losing the
level.

### Four states, one owner

`locked` → `available` → `in-progress` → `acquired`. The status is computed
server-side and passed to a presentational component. `LevelTrack` takes no unlock
decision: a level that looked open in the browser but was refused by the server
would be exactly the dishonest control PR-00 removed.

Every non-acquired level renders its `blockers` verbatim, so a learner never has
to guess what is missing.

## Consequences

- New global catalogue tables (`curriculum_versions`, `module_levels`) with no
  owner and no RLS, written by `seed.ts` alongside `exercises` and `exam_sessions`.
- Four new owned tables (`enrollments`, `mastery_events`, `mastery_snapshots`,
  `unlock_events`) with RLS enabled **and** forced, registered in
  `userOwnedTables` so the isolation suite covers them automatically — it counts
  the list, so a table added without RLS fails the build.
- `POST /api/mastery/events` is the single entry point for progress. No client
  computes a score, so no client can grant itself a level.
- `assertValidCurriculum` runs in the seed. A track with a numbering gap, an
  unknown competency, or a critical competency it does not target fails the seed
  rather than shipping a level nobody can finish — the bug class PR-00 found in
  the business-case scorer.

## Limits assumed in this first version

1. **One track.** `track-compta-generale`, four levels. The model handles many;
   only one is authored, because PR-05 is what fills a track with content.
2. **No decay.** A score does not age. Retention is captured as an activity kind,
   not as a time-based penalty, so a level acquired in July still reads as
   acquired in December.
3. **Latest-wins on a single event per kind.** No "best of last three", no
   confidence interval, no sample-size requirement. One `direct` event at 90 % is
   treated exactly like a hundred of them.
4. **Critical competency strengths come from `competency_progress`**, which PR-01
   feeds from graded attempts. A learner who never attempts an exercise keeps the
   seeded catalogue strength, so on a fresh account level 1's gate is already
   satisfied. That is deliberate for the demo but means the seeded baseline is
   doing real work in the unlock decision.
5. **Levels are not yet wired to content.** Nothing maps an exercise, flashcard or
   exam to a level: activities must call the API with a `levelId`. PR-05 is where
   the accounting track connects its exercises, and until then the only producer
   of mastery events is that endpoint.
6. **`learning_paths.current_day` and `learning_days.status` are still global**
   and untouched. The 30-day path and the level track are two parallel
   representations of progress that do not yet agree with each other.
7. **No unlock notification or history UI.** `unlock_events` records when a level
   was cleared but nothing surfaces it.
