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

const APP_DATABASE_URL = process.env.RLS_TEST_DATABASE_URL;
const ADMIN_DATABASE_URL = process.env.RLS_TEST_ADMIN_DATABASE_URL;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const describeWithDb = APP_DATABASE_URL && ADMIN_DATABASE_URL ? describe : describe.skip;

if (!APP_DATABASE_URL || !ADMIN_DATABASE_URL) {
  console.warn(
    "[mastery-isolation.integration] RLS_TEST_DATABASE_URL and RLS_TEST_ADMIN_DATABASE_URL are required — progression isolation is NOT verified in this run."
  );
}

const LEVEL_1 = "level-compta-generale-1";
const TRACK = "track-compta-generale";
const LEGACY_VERSION = "curriculum-legacy-fixture";
const LEGACY_LEVEL = "level-compta-generale-legacy-fixture";

describeWithDb("progression isolation", () => {
  let admin: Sql;
  let alice: string;
  let bob: string;
  let carol: string;
  let db: typeof import("../src/mastery-repository");

  beforeAll(async () => {
    process.env.DATABASE_URL = APP_DATABASE_URL;
    process.env.FINANCE_HUB_USE_DATABASE = "true";

    db = await import("../src/mastery-repository");
    admin = postgres(ADMIN_DATABASE_URL!, { max: 1 });

    for (const file of migrationFiles) {
      await admin.unsafe(await readFile(resolve(packageRoot, file), "utf8"));
    }

    // Seed the catalogue the levels reference.
    assertValidCurriculum(activeCurriculum);

    await admin`
      insert into curriculum_versions (id, label, effective_from, rules_json)
      values (${activeCurriculum.id}, ${activeCurriculum.label}, ${activeCurriculum.effectiveFrom},
              ${JSON.stringify(activeCurriculum.rules)}::jsonb)
      on conflict (id) do update set rules_json = excluded.rules_json`;

    for (const level of activeCurriculum.levels) {
      await admin`
        insert into competencies (id, domain, name, level_min, level_max, status, strength)
        select unnest(${level.competencyIds}::text[]), 'compta-generale', 'fixture', 1, 4, 'in-progress', 70
        on conflict (id) do nothing`;

      await admin`
        insert into module_levels (id, curriculum_version_id, track_id, module_id, domain, level, title,
                                   objective, competency_ids, critical_competency_ids, estimated_minutes)
        values (${level.id}, ${activeCurriculum.id}, ${level.trackId}, ${level.moduleId}, ${level.domainId},
                ${level.level}, ${level.title}, ${level.objective}, ${level.competencyIds},
                ${level.criticalCompetencyIds}, ${level.estimatedMinutes})
        on conflict (id) do update set track_id = excluded.track_id`;
    }

    const legacyRules = { ...activeCurriculum.rules, version: LEGACY_VERSION, passingScore: 80 };
    await admin`
      insert into curriculum_versions (id, label, effective_from, rules_json)
      values (${LEGACY_VERSION}, 'Legacy fixture', '2026-01-01', ${JSON.stringify(legacyRules)}::jsonb)
      on conflict (id) do update set rules_json = excluded.rules_json`;
    await admin`
      insert into module_levels (id, curriculum_version_id, track_id, module_id, domain, level, title,
                                 objective, competency_ids, critical_competency_ids, estimated_minutes)
      values (${LEGACY_LEVEL}, ${LEGACY_VERSION}, ${TRACK}, 'module-legacy', 'compta-generale', 1,
              'Legacy fixture', 'Legacy fixture', array['cg-cutoff'], array['cg-cutoff'], 60)
      on conflict (id) do update set curriculum_version_id = excluded.curriculum_version_id`;

    const [aliceRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('alice-mastery@example.test', 'alice-mastery@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    const [bobRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('bob-mastery@example.test', 'bob-mastery@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;

    alice = aliceRow.id;
    bob = bobRow.id;

    const [carolRow] = await admin`
      insert into app_users (email, email_normalized, password_hash)
      values ('carol-mastery@example.test', 'carol-mastery@example.test', 'scrypt$fixture')
      on conflict (email_normalized) do update set updated_at = now()
      returning id`;
    carol = carolRow.id;
    await admin`
      insert into enrollments (user_id, curriculum_version_id, track_id)
      values (${carol}, ${LEGACY_VERSION}, ${TRACK})
      on conflict (user_id, track_id) do update set curriculum_version_id = excluded.curriculum_version_id`;
  }, 180_000);

  afterAll(async () => {
    if (!admin) {
      return;
    }

    await admin`delete from app_users where email_normalized in ('alice-mastery@example.test', 'bob-mastery@example.test', 'carol-mastery@example.test')`;
    await admin.end();
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

  it("does not rewrite a snapshot when an unchanged track is refreshed", async () => {
    const [before] = await admin`
      select computed_at from mastery_snapshots where user_id = ${alice} and level_id = ${LEVEL_1}`;

    await db.refreshTrackProgress(alice, TRACK);

    const [after] = await admin`
      select computed_at from mastery_snapshots where user_id = ${alice} and level_id = ${LEVEL_1}`;

    expect(after.computed_at).toEqual(before.computed_at);
  });

  it("uses the learner's pinned version and rejects a level from another version", async () => {
    const curriculum = await db.getTrackCurriculum(carol, TRACK);

    expect(curriculum?.id).toBe(LEGACY_VERSION);
    await expect(
      db.recordMasteryEvent(carol, { levelId: LEVEL_1, kind: "direct", scorePercent: 90 })
    ).rejects.toMatchObject({ name: "MasteryLevelNotAvailableError" });
    await expect(
      db.recordMasteryEvent(carol, { levelId: LEGACY_LEVEL, kind: "direct", scorePercent: 90 })
    ).resolves.toBe(TRACK);
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
