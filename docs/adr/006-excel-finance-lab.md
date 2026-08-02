# ADR 006 — Excel Finance Lab without a spreadsheet engine (PR-06)

Status: accepted
Date: 2026-08-03

## Context

The roadmap asks for a finance lab built on spreadsheet reasoning, and warns in
the same breath against drifting into a real spreadsheet. That warning is the
whole design problem, because the obvious implementation — parse `=B2+B3`,
resolve the references, recalculate — is both the most impressive demo and the
worst outcome.

A half-working formula engine fails in a specific and damaging way. When a
figure comes out wrong, the learner cannot tell whether they made a mistake or
the engine did. Every subsequent correction becomes a trust problem, and a
teaching tool that the learner has stopped trusting teaches nothing. Getting
from "half-working" to "trustworthy" means operator precedence, ranges,
absolute references, a function library and a dependency graph — Excel, in other
words, which is neither the scope of one PR nor the point of the exercise.

## Decision

### The lab checks results and formula *patterns*, and never computes

`packages/domain/src/evaluators/spreadsheet.ts` is a fifth evaluator alongside
the four from PR-03. It reads a submission of the form
`{ cells: { B12: { value, formula } } }` and checks each authored cell two ways:

- **Value check** — the figure, within an authored tolerance.
- **Formula pattern check** — an anchored regular expression tested against the
  learner's normalised formula text.

Nothing is parsed as an expression, nothing is evaluated, no cell depends on
another. The learner computes; the lab checks.

### Value and method are separate criteria, weighted 60/40

This is the pedagogical core, not an implementation detail. "Got the right
number" and "got it a way that survives the data changing" are different skills,
and a finance lab exists mostly to teach the second. Somebody who computes on a
calculator and types `600000` has the first and not the second; somebody who
writes `=SUM(B2:B13)` over the wrong range has the second and not the first.

Collapsing them into one mark would make those two indistinguishable. So a
correct value with a hard-coded `=600000` scores 12/20 and the feedback names it
as a *method* error rather than an arithmetic one — the learner's arithmetic was
right, and saying otherwise would be false.

### Formula patterns are anchored, and their limits are real

`compileFormulaPattern` wraps every authored source in `^…$`, because an
unanchored `SUM\(B2:B13\)` would also accept `=SUM(B2:B13)+999` — exactly the
near-miss the check exists to catch. Normalisation makes whitespace, case, a
missing leading `=` and absolute-reference `$` insignificant. The last is a
judgement call: absolute references matter when a formula is copied across
cells, no exercise here asks for that, and failing somebody for `$B$4` would mark
a distinction the lab never taught.

**The limitation this leaves is genuine and unhidden.** A pattern cannot
recognise an equivalent formula its author did not anticipate: a learner who
writes `=B3+B2` where the spec lists `=B2+B3` loses the formula marks unless the
author spelled that alternative out — which, for the ten exercises here, they
did. It is the reason a value check normally accompanies a formula check, so a
learner with a valid unanticipated method still keeps the majority of the marks.

### The datasets are CSV files, and a test proves the code agrees with them

`datasets/excel/` holds four committed files. The typed constants in
`excel-lab.ts` are their runtime form, which would normally invite drift, so
`excel-lab.test.ts` reads the files off disk, parses them with the exported
parser, and asserts equality. A figure edited in one place and not the other
fails there instead of silently re-grading somebody.

The reader is deliberately small — comma-separated, one header, no quoting — and
throws on a row whose field count disagrees with the header rather than padding
it. A padded row becomes an empty cell, and an empty cell in a P&L is a figure a
learner would be marked wrong for not inventing.

The expected answers are also derived *from* the datasets in the tests rather
than restated, so editing a CSV without editing the answers fails.

### A new `evaluation_type`, and therefore a migration

`exercise_versions.evaluation_type` carries a CHECK constraint listing accepted
engines, which is what makes an unrecognised value fail cheaply rather than
reach an evaluator that cannot read it. Migration 0008 widens that list. A seed
run against an un-migrated database now fails loudly on the constraint instead
of writing a specification nothing can grade.

### Progression goes through a registry, not another branch

PR-05 wired module progression by calling `getComptaGeneraleV1Level` directly
inside `submitAttempt`. A second module would have made that a growing chain of
`if`s in the grading path. `packages/domain/src/modules.ts` now holds one
registry; `submitAttempt` asks it, and adding a module is an entry there rather
than an edit to the grader.

## Consequences

### Assumed limits of the MVP grid

- **No recalculation, no dependency graph, no function library.** The grid is a
  controlled table; editable cells are typed into, given cells are not.
- **A formula is text.** It is never executed, so a formula that is correct but
  differently written than the author anticipated loses the method marks.
- **One dataset per exercise, no cross-sheet references.** Each exercise is
  standalone, with any intermediate figure it needs supplied as a read-only row.
- **No cell selection, no keyboard navigation between cells, no copy/fill.**
  Tabbing works because they are ordinary inputs; nothing more.
- **No charts, no conditional formatting, no pivot.**
- **Percentages are typed as points** (`37,5` for 37,5 %), because there is no
  cell formatting to distinguish `0,375` from `37,5 %`.

### Recommended for a v2

1. **A real expression evaluator over a whitelisted grammar** — `+ - * / ()`,
   cell refs, ranges, and `SUM`/`AVERAGE`/`MIN`/`MAX`. That is a bounded,
   testable subset, and it would let the lab check that a formula *computes the
   expected value* rather than that it matches a pattern. This is the single
   change that removes the biggest limitation above, and it is worth doing only
   with the same golden-case discipline used here.
2. **Author-side equivalence checking.** With an evaluator, a spec could state
   the expected value and let any formula that produces it over the given data —
   and over a second, perturbed dataset — earn the method marks. Perturbing the
   data is what distinguishes a real formula from a hard-coded result without
   needing a pattern at all.
3. **Multi-cell exercises with dependencies**, e.g. build the whole SIG cascade
   in one grid, which needs (1) first.
4. **Keyboard navigation and fill-down**, once there is more than one row of
   inputs to move between.
5. **CSV import by the learner** — the datasets are already parsed by committed
   code, so the missing piece is an upload boundary and its validation, not a
   parser.
6. **A cash-forecast exercise with a rolling opening balance**, currently
   avoided because the closing position is checked by value alone.
