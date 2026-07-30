import { asc, eq, sql } from "drizzle-orm";
import {
  ACTIVITY_KINDS,
  activeCurriculum,
  assertValidCurriculum,
  assertValidRules,
  domains,
  evaluateTrack,
  getTrackLevels,
  shouldRecordUnlock,
  type CurriculumVersion,
  type DomainId,
  type LevelSnapshot,
  type LevelStatus,
  type MasteryEvent,
  type MasteryRules,
  type ModuleLevelDefinition,
  type UnlockBlocker,
  type UnlockBlockerCode
} from "@finance/domain";
import { z } from "zod";
import { canUseDatabase, createDb } from "./client";
import {
  curriculumVersionsTable,
  enrollmentsTable,
  masteryEventsTable,
  masterySnapshotsTable,
  moduleLevelsTable,
  unlockEventsTable
} from "./drizzle-schema";
import { getCompetencies } from "./repository";
import { assertUserId, withUserContext } from "./user-context";

/**
 * Persistence for the mastery model of `@finance/domain`.
 *
 * The split mirrors the migration: `curriculum_versions` and `module_levels` are
 * the global catalogue, everything else is owned and read/written through
 * {@link withUserContext} so row level security applies.
 *
 * Two invariants are enforced here rather than left to callers:
 *
 * - **The enrolment pins the rules.** Progress is always evaluated against the
 *   curriculum version the learner enrolled under, never against whatever is
 *   currently active, so publishing new thresholds cannot re-grade somebody
 *   mid-track.
 * - **Acquisition is monotonic.** `unlock_events` is append-once; the evaluator
 *   reads those rows back as `alreadyAcquired`, so a later dip in scores cannot
 *   re-lock a level that was cleared.
 *
 * Every function is guarded by `canUseDatabase()`. In seeded mode a read returns
 * its empty value and a write is a no-op, which keeps "nothing is persisted"
 * distinguishable from "the learner has done nothing" only at the call site —
 * callers that need the catalogue without a database should use the
 * `activeCurriculum` constant from `@finance/domain` directly.
 */

/** Raised when a persisted row cannot be read back as its domain type. */
export class MalformedPersistedDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedPersistedDataError";
  }
}

/** The requested level is absent from the learner's pinned curriculum version. */
export class MasteryLevelNotAvailableError extends Error {
  constructor(levelId: string) {
    super(`Level "${levelId}" is not available in this learner's curriculum version.`);
    this.name = "MasteryLevelNotAvailableError";
  }
}

// --- Validation boundaries -------------------------------------------------
//
// `rules_json`, `detail_json` and `blockers_json` arrive as `unknown` from
// the driver. They are parsed, never cast: a malformed row must fail loudly
// instead of producing a snapshot whose thresholds are quietly wrong.

const activityKindSchema = z.enum(ACTIVITY_KINDS);

/**
 * Shape shared by `MasteryRules.weights` (0–1) and `LevelSnapshot.components`
 * (0–100). Only the shape is shared; the ranges are checked by the domain and by
 * the column constraints respectively.
 */
const activityRecordSchema = z.object({
  direct: z.number(),
  retention: z.number(),
  caseStudy: z.number(),
  explanation: z.number()
});

const masteryRulesSchema = z.object({
  version: z.string().min(1),
  weights: activityRecordSchema,
  passingScore: z.number(),
  criticalCompetencyMinimum: z.number(),
  requireFinalDiagnostic: z.boolean()
});

/** `finalDiagnostic` is a gate rather than a weighted component, hence the extra member. */
const MASTERY_EVENT_KINDS = [...ACTIVITY_KINDS, "finalDiagnostic"] as const;

const masteryEventKindSchema = z.enum(MASTERY_EVENT_KINDS);

/** Mirrors `LevelStatus`; kept in sync by the `satisfies` clause. */
const LEVEL_STATUSES = ["locked", "available", "in-progress", "acquired"] as const satisfies readonly LevelStatus[];

const levelStatusSchema = z.enum(LEVEL_STATUSES);

/** Mirrors `UnlockBlockerCode`; kept in sync by the `satisfies` clause. */
const UNLOCK_BLOCKER_CODES = [
  "previous-level-not-acquired",
  "score-below-threshold",
  "critical-competency-too-weak",
  "final-diagnostic-missing"
] as const satisfies readonly UnlockBlockerCode[];

const blockersSchema = z.array(
  z.object({
    code: z.enum(UNLOCK_BLOCKER_CODES),
    detail: z.string()
  })
);

/**
 * What `detail_json` holds.
 *
 * `mastery_snapshots` has no column for `missingKinds` or
 * `finalDiagnosticCompleted`, and neither is recoverable from the score — a
 * component of 0 because nothing was attempted must stay distinguishable from a
 * component of 0 that was earned. They travel with the components so
 * {@link getSnapshots} round-trips a `LevelSnapshot` without inventing values.
 */
const snapshotDetailSchema = z.object({
  components: activityRecordSchema,
  missingKinds: z.array(activityKindSchema),
  finalDiagnosticCompleted: z.boolean()
});

export const masteryEventInputSchema = z.object({
  levelId: z.string().min(1),
  kind: masteryEventKindSchema,
  scorePercent: z.number().min(0).max(100),
  sourceRef: z.string().min(1).optional(),
  /** ISO 8601. Omit to let the database stamp `now()`. */
  occurredAt: z.string().min(1).optional()
});

export type MasteryEventInput = z.infer<typeof masteryEventInputSchema>;

const knownDomainIds = new Set<string>(domains.map((domain) => domain.id));

function toDomainId(value: string, levelId: string): DomainId {
  if (!knownDomainIds.has(value)) {
    throw new MalformedPersistedDataError(
      `module_levels.domain for "${levelId}" is not a known domain: "${value}".`
    );
  }

  // Checked against the taxonomy immediately above, so the narrowing is sound.
  return value as DomainId;
}

function parseRules(versionId: string, value: unknown): MasteryRules {
  const parsed = masteryRulesSchema.safeParse(value);

  if (!parsed.success) {
    throw new MalformedPersistedDataError(
      `curriculum_versions.rules_json for "${versionId}" is not valid mastery rules: ${parsed.error.message}`
    );
  }

  // Structure is not enough: the weights must also sum to 1 and the thresholds
  // must be percentages. Failing here points at the row instead of surfacing
  // later, mid-evaluation, as somebody's score being silently rescaled.
  assertValidRules(parsed.data);

  return parsed.data;
}

/**
 * NUMERIC and TIMESTAMPTZ both come back as driver strings. Scores become
 * numbers, timestamps become the UTC "Z" form — the domain orders events by
 * comparing `occurredAt` lexicographically, which only equals chronological
 * order once every value is normalised to the same representation.
 */
function toIsoTimestamp(value: string): string {
  return new Date(value).toISOString();
}

// --- Curriculum ------------------------------------------------------------

async function loadCurriculumVersion(versionId: string): Promise<CurriculumVersion | null> {
  const db = createDb();

  const versionRows = await db
    .select({
      id: curriculumVersionsTable.id,
      label: curriculumVersionsTable.label,
      effectiveFrom: curriculumVersionsTable.effectiveFrom,
      rulesJson: curriculumVersionsTable.rulesJson
    })
    .from(curriculumVersionsTable)
    .where(eq(curriculumVersionsTable.id, versionId))
    .limit(1);

  const versionRow = versionRows[0];

  if (!versionRow) {
    return null;
  }

  const levelRows = await db
    .select()
    .from(moduleLevelsTable)
    .where(eq(moduleLevelsTable.curriculumVersionId, versionId))
    .orderBy(asc(moduleLevelsTable.trackId), asc(moduleLevelsTable.level));

  const levels: ModuleLevelDefinition[] = levelRows.map((row) => ({
    id: row.id,
    trackId: row.trackId,
    moduleId: row.moduleId,
    domainId: toDomainId(row.domain, row.id),
    level: row.level,
    title: row.title,
    objective: row.objective,
    competencyIds: row.competencyIds,
    criticalCompetencyIds: row.criticalCompetencyIds,
    estimatedMinutes: row.estimatedMinutes
  }));

  const curriculum: CurriculumVersion = {
    id: versionRow.id,
    label: versionRow.label,
    effectiveFrom: versionRow.effectiveFrom.slice(0, 10),
    rules: parseRules(versionRow.id, versionRow.rulesJson),
    levels
  };

  // The seed validates before writing; validate again at the read boundary so a
  // manually corrupted catalogue cannot yield a version that looks loadable but
  // contains impossible unlock conditions.
  assertValidCurriculum(curriculum);

  return curriculum;
}

/**
 * The version new enrolments are created against, read back from the database.
 *
 * Selection is by id — `activeCurriculum.id` — and never by comparing
 * `effective_from`, so two versions may share an effective date without the
 * choice becoming ambiguous. Returns null when the catalogue has not been
 * seeded, which is what distinguishes an empty database from a stale one.
 */
export async function getActiveCurriculumVersion(): Promise<CurriculumVersion | null> {
  if (!canUseDatabase()) {
    return null;
  }

  return loadCurriculumVersion(activeCurriculum.id);
}

// --- Enrolment -------------------------------------------------------------

/** Idempotent: the first enrolment wins, so the pinned version never moves. */
export async function ensureEnrollment(
  userId: string,
  trackId: string,
  curriculumVersionId: string
): Promise<void> {
  if (!canUseDatabase()) {
    return;
  }

  assertUserId(userId, "ensureEnrollment");

  await withUserContext(userId, async (tx) => {
    await tx
      .insert(enrollmentsTable)
      .values({ userId, trackId, curriculumVersionId })
      .onConflictDoNothing();
  });
}

/** The curriculum version this learner's track is pinned to, or null. */
export async function getEnrollment(userId: string, trackId: string): Promise<string | null> {
  if (!canUseDatabase()) {
    return null;
  }

  assertUserId(userId, "getEnrollment");

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({ curriculumVersionId: enrollmentsTable.curriculumVersionId })
      .from(enrollmentsTable)
      .where(eq(enrollmentsTable.trackId, trackId))
      .limit(1);

    return rows[0]?.curriculumVersionId ?? null;
  });
}

/**
 * Resolves the curriculum a learner must use for one track.
 *
 * The first visit pins the active version; every later read returns that exact
 * version. This is the only version-selection boundary for persisted progress.
 */
export async function getTrackCurriculum(userId: string, trackId: string): Promise<CurriculumVersion | null> {
  if (!canUseDatabase()) {
    return null;
  }

  assertUserId(userId, "getTrackCurriculum");

  const pinnedVersionId = await getEnrollment(userId, trackId);

  if (pinnedVersionId) {
    const pinned = await loadCurriculumVersion(pinnedVersionId);

    return pinned && getTrackLevels(pinned, trackId).length > 0 ? pinned : null;
  }

  const active = await getActiveCurriculumVersion();

  if (!active || getTrackLevels(active, trackId).length === 0) {
    return null;
  }

  await ensureEnrollment(userId, trackId, active.id);
  return active;
}

// --- Mastery events --------------------------------------------------------

/** Records an event only when its level belongs to the learner's pinned curriculum. */
export async function recordMasteryEvent(userId: string, event: MasteryEventInput): Promise<string> {
  if (!canUseDatabase()) {
    return "";
  }

  assertUserId(userId, "recordMasteryEvent");

  // Parsed before it reaches SQL so an out-of-range score fails with a field
  // path rather than as a CHECK violation from the driver.
  const input = masteryEventInputSchema.parse(event);
  const levelRows = await createDb()
    .select({
      trackId: moduleLevelsTable.trackId,
      curriculumVersionId: moduleLevelsTable.curriculumVersionId
    })
    .from(moduleLevelsTable)
    .where(eq(moduleLevelsTable.id, input.levelId))
    .limit(1);
  const level = levelRows[0];

  if (!level) {
    throw new MasteryLevelNotAvailableError(input.levelId);
  }

  const curriculum = await getTrackCurriculum(userId, level.trackId);

  if (!curriculum || curriculum.id !== level.curriculumVersionId) {
    throw new MasteryLevelNotAvailableError(input.levelId);
  }

  await withUserContext(userId, async (tx) => {
    await tx.insert(masteryEventsTable).values({
      userId,
      levelId: input.levelId,
      kind: input.kind,
      scorePercent: input.scorePercent.toFixed(2),
      sourceRef: input.sourceRef ?? null,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {})
    });
  });

  return level.trackId;
}

/**
 * Every event of the track, oldest first.
 *
 * Scoping goes through `module_levels` rather than a stored track id, so the
 * track membership of a level can never disagree with the catalogue. Levels are
 * matched by track alone: level ids are unique per curriculum version, and the
 * evaluator filters events by level id, so an event from another version cannot
 * leak into a score.
 */
export async function getMasteryEvents(userId: string, trackId: string): Promise<MasteryEvent[]> {
  if (!canUseDatabase()) {
    return [];
  }

  assertUserId(userId, "getMasteryEvents");

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        levelId: masteryEventsTable.levelId,
        kind: masteryEventsTable.kind,
        scorePercent: masteryEventsTable.scorePercent,
        occurredAt: masteryEventsTable.occurredAt
      })
      .from(masteryEventsTable)
      .innerJoin(moduleLevelsTable, eq(moduleLevelsTable.id, masteryEventsTable.levelId))
      .where(eq(moduleLevelsTable.trackId, trackId))
      // Timestamps can tie. The immutable event id makes the input order to the
      // pure latest-wins reducer stable across recalculations.
      .orderBy(asc(masteryEventsTable.occurredAt), asc(masteryEventsTable.id));

    return rows.map((row) => {
      const kind = masteryEventKindSchema.safeParse(row.kind);

      if (!kind.success) {
        throw new MalformedPersistedDataError(
          `mastery_events.kind for level "${row.levelId}" is not a known activity kind: "${row.kind}".`
        );
      }

      return {
        levelId: row.levelId,
        kind: kind.data,
        scorePercent: Number(row.scorePercent),
        occurredAt: toIsoTimestamp(row.occurredAt)
      };
    });
  });
}

// --- Unlocks ---------------------------------------------------------------

/** Level ids of the track already cleared, in gating order. */
export async function getAcquiredLevelIds(userId: string, trackId: string): Promise<string[]> {
  if (!canUseDatabase()) {
    return [];
  }

  assertUserId(userId, "getAcquiredLevelIds");

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({ levelId: unlockEventsTable.levelId })
      .from(unlockEventsTable)
      .innerJoin(moduleLevelsTable, eq(moduleLevelsTable.id, unlockEventsTable.levelId))
      .where(eq(moduleLevelsTable.trackId, trackId))
      .orderBy(asc(moduleLevelsTable.level));

    return rows.map((row) => row.levelId);
  });
}

/**
 * Records that a level was cleared. Returns whether a row was created, so a
 * caller can tell a first acquisition from a replay — the UNIQUE constraint makes
 * the second one a no-op rather than a duplicate or an error.
 */
export async function recordUnlock(
  userId: string,
  levelId: string,
  rulesVersion: string,
  score: number
): Promise<boolean> {
  if (!canUseDatabase()) {
    return false;
  }

  assertUserId(userId, "recordUnlock");

  return withUserContext(userId, async (tx) => {
    const inserted = await tx
      .insert(unlockEventsTable)
      .values({ userId, levelId, rulesVersion, score: score.toFixed(2) })
      .onConflictDoNothing()
      .returning({ id: unlockEventsTable.id });

    return inserted.length > 0;
  });
}

// --- Snapshots -------------------------------------------------------------

/** Upserts the cache. Recomputing is always safe, so the previous row is simply replaced. */
export async function saveSnapshots(userId: string, snapshots: LevelSnapshot[]): Promise<void> {
  if (!canUseDatabase() || snapshots.length === 0) {
    return;
  }

  assertUserId(userId, "saveSnapshots");

  await withUserContext(userId, async (tx) => {
    for (const snapshot of snapshots) {
      // Drizzle serializes JSONB values in `.values()`, but interpolating an
      // array of objects into a raw `sql` predicate expands it as a PostgreSQL
      // record. Keep the exact JSON representation for both the insert and
      // the idempotence comparison.
      const detailJson = JSON.stringify({
        components: snapshot.components,
        missingKinds: snapshot.missingKinds,
        finalDiagnosticCompleted: snapshot.finalDiagnosticCompleted
      });
      const blockersJson = JSON.stringify(snapshot.blockers);
      const values = {
        userId,
        levelId: snapshot.levelId,
        rulesVersion: snapshot.rulesVersion,
        status: snapshot.status,
        score: snapshot.score.toFixed(2),
        detailJson,
        blockersJson,
        computedAt: new Date().toISOString()
      };

      await tx
        .insert(masterySnapshotsTable)
        .values(values)
        .onConflictDoUpdate({
          target: [masterySnapshotsTable.userId, masterySnapshotsTable.levelId],
          set: {
            rulesVersion: values.rulesVersion,
            status: values.status,
            score: values.score,
            detailJson: values.detailJson,
            blockersJson: values.blockersJson,
            computedAt: values.computedAt
          },
          // A snapshot is a cache of a pure calculation. An identical replay
          // must not write solely to move `computedAt` forward.
          where: sql`
            ${masterySnapshotsTable.rulesVersion} IS DISTINCT FROM ${values.rulesVersion}
            OR ${masterySnapshotsTable.status} IS DISTINCT FROM ${values.status}
            OR ${masterySnapshotsTable.score} IS DISTINCT FROM ${values.score}
            OR ${masterySnapshotsTable.detailJson} IS DISTINCT FROM ${values.detailJson}
            OR ${masterySnapshotsTable.blockersJson} IS DISTINCT FROM ${values.blockersJson}
          `
        });
    }
  });
}

export async function getSnapshots(userId: string, trackId: string): Promise<LevelSnapshot[]> {
  if (!canUseDatabase()) {
    return [];
  }

  assertUserId(userId, "getSnapshots");

  return withUserContext(userId, async (tx) => {
    const rows = await tx
      .select({
        levelId: masterySnapshotsTable.levelId,
        rulesVersion: masterySnapshotsTable.rulesVersion,
        status: masterySnapshotsTable.status,
        score: masterySnapshotsTable.score,
        detailJson: masterySnapshotsTable.detailJson,
        blockersJson: masterySnapshotsTable.blockersJson
      })
      .from(masterySnapshotsTable)
      .innerJoin(moduleLevelsTable, eq(moduleLevelsTable.id, masterySnapshotsTable.levelId))
      .where(eq(moduleLevelsTable.trackId, trackId))
      .orderBy(asc(moduleLevelsTable.level));

    return rows.map((row) => {
      const status = levelStatusSchema.safeParse(row.status);
      const detail = snapshotDetailSchema.safeParse(row.detailJson);
      const blockers = blockersSchema.safeParse(row.blockersJson);

      if (!status.success || !detail.success || !blockers.success) {
        throw new MalformedPersistedDataError(
          `mastery_snapshots row for level "${row.levelId}" cannot be read back as a LevelSnapshot.`
        );
      }

      const parsedBlockers: UnlockBlocker[] = blockers.data;

      return {
        levelId: row.levelId,
        rulesVersion: row.rulesVersion,
        status: status.data,
        score: Number(row.score),
        components: detail.data.components,
        missingKinds: detail.data.missingKinds,
        finalDiagnosticCompleted: detail.data.finalDiagnosticCompleted,
        blockers: parsedBlockers
      };
    });
  });
}

// --- Orchestration ---------------------------------------------------------

/**
 * Recomputes a track: evaluate, record any newly cleared level, refresh the
 * cache, return it.
 *
 * The evaluation itself is pure — everything it needs is loaded first — which is
 * why this is the only function that has to know the order of operations.
 */
export async function refreshTrackProgress(userId: string, trackId: string): Promise<LevelSnapshot[]> {
  if (!canUseDatabase()) {
    return [];
  }

  assertUserId(userId, "refreshTrackProgress");

  const version = await getTrackCurriculum(userId, trackId);

  if (!version) {
    return [];
  }

  const levels = getTrackLevels(version, trackId);

  if (levels.length === 0) {
    return [];
  }

  const events = await getMasteryEvents(userId, trackId);
  const acquired = new Set(await getAcquiredLevelIds(userId, trackId));
  const competencies = await getCompetencies(userId);
  const strengthByCompetency = new Map(competencies.map((competency) => [competency.id, competency.strength]));

  const trackLevels = levels.map((level) => ({
    levelId: level.id,
    criticalCompetencies: level.criticalCompetencyIds.map((competencyId) => ({
      competencyId,
      // An untracked competency counts as zero: absent evidence must block the
      // level, not read as mastery.
      strength: strengthByCompetency.get(competencyId) ?? 0
    }))
  }));

  let snapshots = evaluateTrack(trackLevels, { events, acquiredLevelIds: acquired }, version.rules);
  let recordedAny = false;

  for (const snapshot of snapshots) {
    if (!shouldRecordUnlock(snapshot, acquired.has(snapshot.levelId))) {
      continue;
    }

    recordedAny = (await recordUnlock(userId, snapshot.levelId, snapshot.rulesVersion, snapshot.score)) || recordedAny;
    acquired.add(snapshot.levelId);
  }

  if (recordedAny) {
    // Re-evaluate once so the snapshots we persist agree with the unlock rows we
    // just wrote, and so a level cleared in this pass immediately reports its
    // successor as reachable instead of on the next page load.
    snapshots = evaluateTrack(trackLevels, { events, acquiredLevelIds: acquired }, version.rules);
  }

  await saveSnapshots(userId, snapshots);

  return snapshots;
}
