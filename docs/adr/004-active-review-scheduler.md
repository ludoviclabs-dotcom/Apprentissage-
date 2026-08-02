# ADR 004 — A fixed-interval, self-reported review scheduler (PR-04)

Status: accepted
Date: 2026-08-02

## Context

"Revisions" existed before this PR in name only. `/revisions` rendered every
seeded flashcard with its answer already on screen, under a heading that said
"à revoir aujourd'hui". Three things were wrong with it:

1. **The answer was visible before the attempt to recall.** Reading a
   question-and-answer pair produces a strong feeling of knowing and almost no
   retention. The screen measured nothing and told the learner they were fine.
2. **The queue was not a queue.** Cards were listed by seeded status, not by
   whether anything was actually due, so the count in the header was decorative.
3. **A failure led nowhere.** Rating a card "Oubliée" moved a due date and
   stopped there. Nothing was scheduled, nothing was owed, and the next session
   looked exactly like the last one.

The roadmap (`docs/roadmap-pr-plan.md`, PR-04) asks for a due queue, a voluntary
reveal, self-assessment, deterministic scheduling and automatic remediation, and
states the risk explicitly: *faire du scheduler trop "smart" trop tôt*.

## Decision

### The whole algorithm is one table

```
forgotten → 1 day     partial → 3 days     correct → 7 days     mastered → 14 days
```

`REVIEW_INTERVAL_DAYS` in `packages/domain/src/review-scheduler.ts` is the
scheduler. There is no ease factor, no per-item difficulty, no half-life
estimate, and no history beyond counters. The interval runs from the moment of
the review, not from the due date it replaces, so a backlog cannot compound into
a queue that is impossible to clear.

Two properties follow, and both are the point:

- **Reproducible.** Same item, same rating, same interval — every time, for
  everybody. The unit tests assert exact dates rather than ranges.
- **Explainable.** Every button in the UI carries its own consequence in its
  tooltip ("Revient dans 7 jours"). A learner never has to trust the system to
  understand what pressing it does.

There was previously a second, disagreeing table: `getRevisionIntervalDays` in
`active-learning.ts` returned 21 days for `mastered` while the queue used 14, so
the next due date depended on which control the learner happened to press. Both
now delegate to `REVIEW_INTERVAL_DAYS`; the visible change is that `mastered`
means 14 days everywhere.

### The answer is fetched, not hidden

`ReviewQueueEntry` has no `answer` field. The review page renders prompts, and
the back of a card is only obtainable through `POST /api/revisions/reveal`.

The cheaper options were rejected for the same reason: a `<details>` element, a
CSS-hidden block, or an answer shipped in the RSC payload all leave the text in
the document, one "view source" — or one screen reader — away from a learner who
has not decided to look. A reveal that the server never sees also cannot be
recorded, and `review_attempts.revealed` is what makes a self-assessment
auditable rather than merely asserted. Two Playwright tests hold this line: one
reads the server's own bytes and asserts the first due item's answer is absent,
another asserts the reveal is a real 200 from `/api/revisions/reveal`.

Revealing is a read, so the public demo may study; it simply cannot record what
happened next.

### Failure is `forgotten`, and it creates exactly one task

A remediation task is opened when — and only when — the learner rates an item
"Pas su", or submits an exercise marked below 10/20. `partial` shortens the
interval and is left at that: widening failure to include it would generate a
task on roughly every second review, and a remediation list that always has
twenty entries is one nobody reads.

The task is dated on the day the failed item itself comes back (J+1), so a
learner working their queue meets the remediation and the retest together
instead of doing the same work twice on two days.

Duplicates are prevented by a partial unique index — one *open* task per item per
learner — rather than by a total one. Failing the same card three evenings
running is normal, and the constraint has to say "you are already working on
this", not "you may only fail this once". Closing a task frees the slot.

### Grading feeds the queue through one path

`ratingFromScore` reads a mark out of 20 onto the same four ratings
(<50% / <70% / <90% / rest), so a PR-03 evaluator result enters the PR-04 ladder
without a second scale to maintain. `submitAttempt` — the single path an answer
takes — enqueues the exercise whatever the mark, because an exercise answered
well today is exactly the one worth seeing again in a week.

### Three owned tables, and the split between them

- `review_queue` — current state, one row per `(user, item_type, item_ref)`,
  updated in place. The uniqueness is what makes enqueueing idempotent.
- `review_attempts` — append-only history, including `revealed`.
- `remediation_tasks` — what a failure owes, with its own status lifecycle.

`item_ref` points into one of two catalogues depending on `item_type`, which is
why it carries no foreign key: that is precisely what lets the queue schedule an
*exercise to retest* alongside the flashcards. All three tables carry `user_id`
and row level security, on the reasoning of ADR 001 — a review schedule is a
record of what somebody does not know yet, which is the most personal thing this
product holds.

`flashcard_states` from PR-02 was kept and is written by the same transaction, so
the card list and the queue can never disagree about a due date. The older
`reviewFlashcard` repository function was removed rather than left alongside:
two write paths to one piece of per-user state is how they drift apart.

## Consequences

### What this version deliberately does not do

- **Intervals do not grow with mastery.** An item answered `correct` ten times
  running still returns after seven days. Real spaced repetition expands the
  interval on each success; doing so needs a per-item state whose behaviour is
  much harder to explain, and it is the first thing to revisit once there is
  usage data to justify a shape.
- **Nothing is inferred from response time or from how often an item lapses.**
  `lapse_count` is recorded and shown, but the scheduler ignores it.
- **The rating is self-reported and unverified.** For a flashcard there is
  nothing else available; the honest mitigation is that a failed review schedules
  an *exercise*, which is graded.
- **Remediation content is generic.** The task points at the item's own prompt
  and, where the content offers one, an exercise to re-attempt. There is no
  isomorphic exercise generation and no micro-lesson authoring — PR-05 is where
  content that can be pointed at arrives.
- **The session is capped at twelve items** with no way to ask for more from the
  UI. A learner with a hundred due items sees twelve and the header tells them
  how many are waiting.
- **`mastered` does not retire an item.** Due date is the only gate, so
  everything comes back eventually, including cards the seed authored as
  mastered.

### Verification

The ladder, the ordering, the tie-break, the failure boundary and the score bands
are covered by 31 unit tests in `packages/domain/test/review-scheduler.test.ts`.
The full browser flow — hidden answer, reveal, rating, reschedule, remediation —
is covered by `tests/e2e/review-flow.spec.ts` against the seeded server, which is
also what the public demo runs. Persistence, isolation between two accounts and
remediation idempotence need a real PostgreSQL and are covered by
`packages/db/test/review-queue.integration.test.ts`, which runs in the `rls` CI
job and skips loudly everywhere else.
