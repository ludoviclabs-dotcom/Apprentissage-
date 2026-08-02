import { and, asc, eq, inArray } from "drizzle-orm";
import { EVALUATION_TYPES, authoredExerciseVersions } from "@finance/domain";
import { z } from "zod";
import { canUseDatabase, createDb } from "./client";
import { exerciseCriteriaTable, exerciseTestCasesTable, exerciseVersionsTable } from "./drizzle-schema";

/**
 * Read access to the versioned exercise specifications of migration 0005.
 *
 * These three tables are the authored catalogue: global, un-RLS'd, and read with
 * no user bound — the same treatment `exercises` and `module_levels` get — so
 * nothing here goes through {@link withUserContext}. What a learner produces
 * against a specification is owned and stays in `attempts`.
 *
 * This module resolves rows into the shape the evaluators of `@finance/domain`
 * consume; it does not interpret a specification. `spec` stays `unknown` all the
 * way out on purpose: its shape belongs to the evaluator named by
 * `evaluationType`, and duplicating that contract here would let the two drift
 * until a spec the domain rejects is one this module happily returns. The
 * boundary this module *does* enforce is that a row is resolvable at all —
 * `evaluationType` is checked against the domain's vocabulary and NUMERIC
 * columns are converted, both loudly.
 *
 * Every function is guarded by `canUseDatabase()` and returns its empty value in
 * seeded mode, the convention `mastery-repository.ts` established.
 */

/** The referenced version does not exist. Distinct from "exists but is empty". */
export class UnknownExerciseVersionError extends Error {
  constructor(exerciseVersionId: string) {
    super(`Exercise version "${exerciseVersionId}" does not exist.`);
    this.name = "UnknownExerciseVersionError";
  }
}

/** A stored row cannot be resolved into a specification the evaluators can run. */
export class MalformedExerciseSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedExerciseSpecError";
  }
}

export interface ResolvedExerciseVersion {
  id: string;
  exerciseId: string;
  version: number;
  /** One of `EVALUATION_TYPES`; checked when the row is read. */
  evaluationType: string;
  /** Validated by the domain evaluator, not here. */
  spec: unknown;
  criteria: Array<{ id: string; label: string; points: number; position: number; spec: unknown }>;
}

export interface ResolvedExerciseTestCase {
  id: string;
  name: string;
  submission: unknown;
  expectedScore: number;
  expectedOutcomes: unknown;
}

// --- Validation boundaries -------------------------------------------------

const evaluationTypeSchema = z.enum(EVALUATION_TYPES);

/**
 * NUMERIC comes back from the postgres-js driver as a string.
 *
 * Parsed rather than coerced at the call site: `Number("")` is 0 and
 * `Number(null)` is 0, so an unchecked conversion turns a corrupt weight into a
 * criterion silently worth nothing — which reads to a learner as a criterion
 * they failed rather than as a broken exercise.
 */
const numericColumnSchema = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? value : Number(value)))
  .refine((value) => Number.isFinite(value));

function toNumber(value: string | number, describe: () => string): number {
  const parsed = numericColumnSchema.safeParse(value);

  if (!parsed.success) {
    throw new MalformedExerciseSpecError(`${describe()} is not a finite number: "${String(value)}".`);
  }

  return parsed.data;
}

function toEvaluationType(value: string, versionId: string): string {
  const parsed = evaluationTypeSchema.safeParse(value);

  if (!parsed.success) {
    // Never narrowed by assertion: an unrecognised type means no evaluator can
    // run, and pretending otherwise would send the row to whichever engine the
    // caller guessed at.
    throw new MalformedExerciseSpecError(
      `exercise_versions.evaluation_type for "${versionId}" is not a known evaluation type: "${value}".`
    );
  }

  return parsed.data;
}

/**
 * JSONB is NOT NULL in the schema, so a missing payload means the row was
 * written around the migration. Caught here rather than in the evaluator, whose
 * error would name a spec field instead of the row that is actually wrong.
 */
function requireJson(value: unknown, describe: () => string): unknown {
  if (value === null || value === undefined) {
    throw new MalformedExerciseSpecError(`${describe()} is empty.`);
  }

  return value;
}

// --- Resolution ------------------------------------------------------------

interface VersionRow {
  id: string;
  exerciseId: string;
  version: number;
  evaluationType: string;
  specJson: unknown;
}

/**
 * Attaches criteria to versions with one extra query rather than one per
 * version: `listAllActiveExerciseVersions` is what the authoring test suite
 * iterates, so the cost of a per-row round trip would land on every run.
 */
async function resolveVersions(rows: VersionRow[]): Promise<ResolvedExerciseVersion[]> {
  if (rows.length === 0) {
    return [];
  }

  const criteriaRows = await createDb()
    .select()
    .from(exerciseCriteriaTable)
    .where(
      inArray(
        exerciseCriteriaTable.exerciseVersionId,
        rows.map((row) => row.id)
      )
    )
    .orderBy(asc(exerciseCriteriaTable.exerciseVersionId), asc(exerciseCriteriaTable.position));

  const criteriaByVersion = new Map<string, ResolvedExerciseVersion["criteria"]>();

  for (const criterion of criteriaRows) {
    const resolved = {
      id: criterion.id,
      label: criterion.label,
      points: toNumber(criterion.points, () => `exercise_criteria.points for "${criterion.id}"`),
      position: criterion.position,
      spec: requireJson(criterion.specJson, () => `exercise_criteria.spec_json for "${criterion.id}"`)
    };
    const bucket = criteriaByVersion.get(criterion.exerciseVersionId);

    if (bucket) {
      bucket.push(resolved);
    } else {
      criteriaByVersion.set(criterion.exerciseVersionId, [resolved]);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    exerciseId: row.exerciseId,
    version: row.version,
    evaluationType: toEvaluationType(row.evaluationType, row.id),
    spec: requireJson(row.specJson, () => `exercise_versions.spec_json for "${row.id}"`),
    // Absent criteria are legitimate: `numeric` and `multiple_choice` carry
    // their weighting inside the spec itself.
    criteria: criteriaByVersion.get(row.id) ?? []
  }));
}

const versionColumns = {
  id: exerciseVersionsTable.id,
  exerciseId: exerciseVersionsTable.exerciseId,
  version: exerciseVersionsTable.version,
  evaluationType: exerciseVersionsTable.evaluationType,
  specJson: exerciseVersionsTable.specJson
} as const;

/**
 * The authored catalogue as a resolved version, for seeded mode.
 *
 * `authoredExerciseVersions` is committed content — the same standing as
 * `exercises` and `module_levels`, which already fall back to their seeded
 * arrays when there is no database. Returning null here instead meant every
 * exercise was graded by `legacy_rubric` in seeded mode however carefully its
 * specification had been authored, so the typed engine was unreachable in the
 * public demo, in local development and in the default Playwright project — the
 * three places the product is actually exercised.
 *
 * Criteria are empty because none of the four evaluators reads them: `numeric`
 * and `multiple_choice` carry their weighting inside the spec, and
 * `journal_entry` and `short_text_rubric` derive theirs from it.
 */
function seededVersion(exerciseId: string): ResolvedExerciseVersion | null {
  const authored = authoredExerciseVersions.find((version) => version.exerciseId === exerciseId);

  if (!authored) {
    return null;
  }

  return {
    id: authored.id,
    exerciseId: authored.exerciseId,
    version: authored.version,
    evaluationType: toEvaluationType(authored.evaluationType, authored.id),
    spec: authored.spec,
    criteria: []
  };
}

/**
 * The specification a new submission must be graded against.
 *
 * The partial unique index of migration 0005 allows at most one active version
 * per exercise, so this cannot be ambiguous; `null` means the exercise has no
 * published version and still belongs to the legacy rubric grader.
 */
export async function getActiveExerciseVersion(exerciseId: string): Promise<ResolvedExerciseVersion | null> {
  if (!canUseDatabase()) {
    return seededVersion(exerciseId);
  }

  const rows = await createDb()
    .select(versionColumns)
    .from(exerciseVersionsTable)
    .where(and(eq(exerciseVersionsTable.exerciseId, exerciseId), eq(exerciseVersionsTable.isActive, true)))
    .limit(1);

  return (await resolveVersions(rows))[0] ?? null;
}

/**
 * A specific version, active or not.
 *
 * This is how a stored attempt stays interpretable: it pins
 * `attempts.exercise_version_id`, and re-reading that exact row is what lets a
 * past mark be recomputed instead of re-derived under whatever is current.
 */
export async function getExerciseVersionById(id: string): Promise<ResolvedExerciseVersion | null> {
  if (!canUseDatabase()) {
    return null;
  }

  const rows = await createDb()
    .select(versionColumns)
    .from(exerciseVersionsTable)
    .where(eq(exerciseVersionsTable.id, id))
    .limit(1);

  return (await resolveVersions(rows))[0] ?? null;
}

/**
 * The author's expectations for one version, in a stable order.
 *
 * Throws when the version itself is absent rather than returning `[]`: "this
 * version ships no tests" and "this version does not exist" call for opposite
 * reactions from the suite that runs them.
 */
export async function listExerciseTestCases(exerciseVersionId: string): Promise<ResolvedExerciseTestCase[]> {
  if (!canUseDatabase()) {
    return [];
  }

  const db = createDb();
  const versionRows = await db
    .select({ id: exerciseVersionsTable.id })
    .from(exerciseVersionsTable)
    .where(eq(exerciseVersionsTable.id, exerciseVersionId))
    .limit(1);

  if (versionRows.length === 0) {
    throw new UnknownExerciseVersionError(exerciseVersionId);
  }

  const rows = await db
    .select()
    .from(exerciseTestCasesTable)
    .where(eq(exerciseTestCasesTable.exerciseVersionId, exerciseVersionId))
    .orderBy(asc(exerciseTestCasesTable.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    submission: requireJson(row.submissionJson, () => `exercise_test_cases.submission_json for "${row.id}"`),
    expectedScore: toNumber(row.expectedScore, () => `exercise_test_cases.expected_score for "${row.id}"`),
    expectedOutcomes: requireJson(
      row.expectedOutcomesJson,
      () => `exercise_test_cases.expected_outcomes_json for "${row.id}"`
    )
  }));
}

/**
 * Every live specification, ordered by exercise.
 *
 * Intended for the authoring checks: validating the whole catalogue in one pass
 * is what makes a spec change that breaks grading fail where it is written.
 */
export async function listAllActiveExerciseVersions(): Promise<ResolvedExerciseVersion[]> {
  if (!canUseDatabase()) {
    return [];
  }

  const rows = await createDb()
    .select(versionColumns)
    .from(exerciseVersionsTable)
    .where(eq(exerciseVersionsTable.isActive, true))
    .orderBy(asc(exerciseVersionsTable.exerciseId));

  return resolveVersions(rows);
}
