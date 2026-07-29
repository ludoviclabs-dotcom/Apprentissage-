import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activeCurriculum, assertValidCurriculum } from "@finance/domain";
import { migrationFiles } from "../src/schema";

/**
 * Reproduces, without a browser, the failure the e2e suite surfaced: after one
 * learner cleared level 1, a second learner's track also reported it acquired.
 *
 * The browser evidence showed each page rendering its own account's email, and
 * the `withUserContext` binding guard never fired, so both transactions were
 * bound to the right user. That leaves the repository layer as the place to look,
 * which is what this file exercises directly.
 */

const DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  console.warn(
    "[mastery-isolation.integration] RLS_TEST_DATABASE_URL is not set — progression isolation is NOT verified in this run."
  );
}

const LEVEL_1 = "level-compta-generale-1";
const TRACK = "track-compta-generale";

describeWithDb("progression isolation", () => {
  let sql: Sql;
  let alice: string;
  let bob: string;
  let db: typeof import("../src/mastery-repository");

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";

    db = await import("../src/mastery-repository");
    sql = postgres(DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await sql.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    // Seed the catalogue the levels reference.
    assertValidCurriculum(activeCurriculum);

    await sql`
      insert into curriculum_versions (id, label, effective_from, rules_json)
      values (${activeCurriculum.id}, ${activeCurriculum.label}, ${activeCurriculum.effectiveFrom},
              ${JSON.stringify(activeCurriculum.rules)}::jsonb)
      on conflict (id) do update set rules_json = excluded.rules_json`;

    for (const level of activeCurriculum.levels) {
      await sql`
        insert into competencies (id, domain, name, level_min, level_max, status, strength)
        select unnest(${level.competencyIds}::text[]), 'compta-generale', 'fixture', 1, 4, 'in-progress', 70
        on conflict (id) do nothing`;

      await sql`
        insert into module_levels (id, curriculum_version_id, track_id, module_id, domain, level, title,
                                   objective, competency_ids, critical_competency_ids, estimated_minutes)
        values (${level.id}, ${activeCurriculum.id}, ${level.trackId}, ${level.moduleId}, ${level.domainId},
                ${level.level}, ${level.title}, ${level.objective}, ${level.competencyIds},
                ${level.criticalCompetencyIds}, ${level.estimatedMinutes})
        on conflict (id) do update set track_id = excluded.track_id`;
    }

    const [aliceRow] = await sql`
      insert into app_users (email, email_normalized, password_hash)
      values ('alice-mastery@example.test', 'alice-mastery@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    const [bobRow] = await sql`
      insert into app_users (email, email_normalized, password_hash)
      values ('bob-mastery@example.test', 'bob-mastery@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    alice = aliceRow.id;
    bob = bobRow.id;
  }, 180_000);

  afterAll(async () => {
    if (!sql) {
      return;
    }

    await sql`delete from app_users where email_normalized in ('alice-mastery@example.test', 'bob-mastery@example.test')`;
    await sql.end();
  });

  it("attributes mastery events to their author only", async () => {
    for (const kind of ["direct", "retention", "caseStudy", "explanation"] as const) {
      await db.recordMasteryEvent(alice, { levelId: LEVEL_1, kind, scorePercent: 90 });
    }
    await db.recordMasteryEvent(alice, { levelId: LEVEL_1, kind: "finalDiagnostic", scorePercent: 100 });

    const aliceEvents = await db.getMasteryEvents(alice, TRACK);
    const bobEvents = await db.getMasteryEvents(bob, TRACK);

    expect(aliceEvents).toHaveLength(5);
    expect(bobEvents, "bob must not see alice's events").toHaveLength(0);
  });

  it("keeps an unlock private to the learner who earned it", async () => {
    const aliceSnapshots = await db.refreshTrackProgress(alice, TRACK);
    const bobSnapshots = await db.refreshTrackProgress(bob, TRACK);

    expect(aliceSnapshots[0]?.status, "alice cleared level 1").toBe("acquired");
    expect(bobSnapshots[0]?.status, "bob did nothing and must not inherit the unlock").toBe("available");
    expect(bobSnapshots[0]?.score).toBe(0);

    const aliceAcquired = await db.getAcquiredLevelIds(alice, TRACK);
    const bobAcquired = await db.getAcquiredLevelIds(bob, TRACK);

    expect(aliceAcquired).toEqual([LEVEL_1]);
    expect(bobAcquired).toEqual([]);
  });

  it("keeps snapshots private", async () => {
    const bobSnapshots = await db.getSnapshots(bob, TRACK);

    for (const snapshot of bobSnapshots) {
      expect(snapshot.score, `${snapshot.levelId} should be untouched for bob`).toBe(0);
    }
  });

  it("is unaffected by the order the two learners are refreshed in", async () => {
    // Refreshing bob first must not let alice's later refresh see bob's state or
    // vice versa; the caches are keyed per user.
    const bobFirst = await db.refreshTrackProgress(bob, TRACK);
    const aliceSecond = await db.refreshTrackProgress(alice, TRACK);

    expect(bobFirst[0]?.status).toBe("available");
    expect(aliceSecond[0]?.status).toBe("acquired");
  });
});
