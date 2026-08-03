import postgres from "postgres";
import {
  assertValidAuthoredVersions,
  assertValidCurriculum,
  authoredExerciseVersions,
  businessCases,
  competencies,
  curriculumVersions,
  documents,
  examSessions,
  exercises,
  flashcards,
  learningModules,
  learningPath,
  lessons,
  sourcePacks
} from "@finance/domain";

// Reference data is administration work. Never require the runtime role to
// hold seed privileges simply because a developer runs `pnpm db:seed`.
const databaseUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_ADMIN_URL (or DATABASE_URL for local setup) is not set. Start Docker Compose and copy .env.example to .env first.");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });

try {
  for (const pack of sourcePacks) {
    await sql`
      INSERT INTO source_packs (id, name, description, domain, version_label, effective_date, imported_at, status)
      VALUES (${pack.id}, ${pack.name}, ${pack.description}, ${pack.domainId}, ${pack.versionLabel}, ${pack.effectiveDate}, ${pack.importedAt}, ${pack.status})
      ON CONFLICT (id) DO UPDATE SET
        description = EXCLUDED.description,
        domain = EXCLUDED.domain,
        version_label = EXCLUDED.version_label,
        effective_date = EXCLUDED.effective_date,
        status = EXCLUDED.status
    `;
  }

  for (const document of documents) {
    await sql`
      INSERT INTO documents (id, source_pack_id, filename, file_type, domain, title, original_path, checksum, imported_at)
      VALUES (${document.id}, ${document.sourcePackId}, ${document.filename}, ${document.fileType}, ${document.domainId}, ${document.title}, ${document.originalPath}, ${document.checksum}, ${document.importedAt})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        original_path = EXCLUDED.original_path,
        checksum = EXCLUDED.checksum
    `;
  }

  for (const competency of competencies) {
    await sql`
      INSERT INTO competencies (id, domain, name, level_min, level_max, status, strength)
      VALUES (${competency.id}, ${competency.domainId}, ${competency.name}, ${competency.levelMin}, ${competency.levelMax}, ${competency.status}, ${competency.strength})
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        strength = EXCLUDED.strength
    `;
  }

  await sql`
    INSERT INTO learning_paths (id, name, duration_days, current_day, goal)
    VALUES (${learningPath.id}, ${learningPath.name}, ${learningPath.durationDays}, ${learningPath.currentDay}, ${learningPath.goal})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      duration_days = EXCLUDED.duration_days,
      current_day = EXCLUDED.current_day,
      goal = EXCLUDED.goal
  `;

  for (const lesson of lessons) {
    await sql`
      INSERT INTO lessons (id, domain, title, concept, rule, reasoning, example, frequent_error, linked_exercise_id)
      VALUES (${lesson.id}, ${lesson.domainId}, ${lesson.title}, ${lesson.concept}, ${lesson.rule}, ${lesson.reasoning}, ${lesson.example}, ${lesson.frequentError}, ${lesson.linkedExerciseId})
      ON CONFLICT (id) DO UPDATE SET
        domain = EXCLUDED.domain,
        title = EXCLUDED.title,
        concept = EXCLUDED.concept,
        rule = EXCLUDED.rule,
        reasoning = EXCLUDED.reasoning,
        example = EXCLUDED.example,
        frequent_error = EXCLUDED.frequent_error,
        linked_exercise_id = EXCLUDED.linked_exercise_id
    `;

    for (const [index, source] of lesson.sourceReferences.entries()) {
      await sql`
        INSERT INTO lesson_sources (id, lesson_id, pack, document, source_type, page_start, page_end, effective_date)
        VALUES (${`${lesson.id}-source-${index + 1}`}, ${lesson.id}, ${source.pack}, ${source.document}, ${source.sourceType}, ${source.pageStart ?? null}, ${source.pageEnd ?? null}, ${source.effectiveDate ?? null})
        ON CONFLICT (id) DO UPDATE SET
          pack = EXCLUDED.pack,
          document = EXCLUDED.document,
          source_type = EXCLUDED.source_type,
          page_start = EXCLUDED.page_start,
          page_end = EXCLUDED.page_end,
          effective_date = EXCLUDED.effective_date
      `;
    }
  }

  for (const exercise of exercises) {
    await sql`
      INSERT INTO exercises (id, domain, type, topic, level, estimated_minutes, statement, expected_answer, rubric_json, competency_ids, source_chunk_ids)
      VALUES (${exercise.id}, ${exercise.domainId}, ${exercise.type}, ${exercise.title}, ${exercise.level}, ${exercise.estimatedMinutes}, ${exercise.statement}, ${exercise.expectedAnswer}, ${JSON.stringify(exercise.rubric)}::jsonb, ${exercise.competencyIds}, ${exercise.sourceChunkIds})
      ON CONFLICT (id) DO UPDATE SET
        type = EXCLUDED.type,
        topic = EXCLUDED.topic,
        level = EXCLUDED.level,
        estimated_minutes = EXCLUDED.estimated_minutes,
        statement = EXCLUDED.statement,
        expected_answer = EXCLUDED.expected_answer,
        rubric_json = EXCLUDED.rubric_json,
        competency_ids = EXCLUDED.competency_ids,
        source_chunk_ids = EXCLUDED.source_chunk_ids
    `;
  }

  for (const module of learningModules) {
    await sql`
      INSERT INTO modules (id, title, domain, tier, description, objective, payload_json)
      VALUES (${module.id}, ${module.title}, ${module.domainId}, ${module.tier}, ${module.description}, ${module.objective}, ${JSON.stringify(module)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        domain = EXCLUDED.domain,
        tier = EXCLUDED.tier,
        description = EXCLUDED.description,
        objective = EXCLUDED.objective,
        payload_json = EXCLUDED.payload_json
    `;
  }

  for (const card of flashcards) {
    await sql`
      INSERT INTO flashcards (id, module_id, concept_id, domain, type, front, back, explanation, competency_ids, status, due_at, interval_days, source_references_json)
      VALUES (${card.id}, ${card.moduleId}, ${card.conceptId}, ${card.domainId}, ${card.type}, ${card.front}, ${card.back}, ${card.explanation}, ${card.competencyIds}, ${card.status}, ${card.dueAt}, ${card.intervalDays}, ${JSON.stringify(card.sourceReferences)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        module_id = EXCLUDED.module_id,
        concept_id = EXCLUDED.concept_id,
        domain = EXCLUDED.domain,
        type = EXCLUDED.type,
        front = EXCLUDED.front,
        back = EXCLUDED.back,
        explanation = EXCLUDED.explanation,
        competency_ids = EXCLUDED.competency_ids,
        status = EXCLUDED.status,
        due_at = EXCLUDED.due_at,
        interval_days = EXCLUDED.interval_days,
        source_references_json = EXCLUDED.source_references_json
    `;
  }

  for (const exam of examSessions) {
    await sql`
      INSERT INTO exam_sessions (id, title, exercise_ids, duration_minutes, status, started_at, submitted_at, score)
      VALUES (${exam.id}, ${exam.title}, ${exam.exerciseIds}, ${exam.durationMinutes}, ${exam.status}, ${exam.startedAt ?? null}, ${exam.submittedAt ?? null}, ${exam.score ?? null})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        exercise_ids = EXCLUDED.exercise_ids,
        duration_minutes = EXCLUDED.duration_minutes,
        status = EXCLUDED.status,
        score = EXCLUDED.score
    `;
  }

  for (const businessCase of businessCases) {
    await sql`
      INSERT INTO business_cases (id, title, domain, level, status, payload_json)
      VALUES (${businessCase.id}, ${businessCase.title}, ${businessCase.domainId}, ${businessCase.level}, ${businessCase.status}, ${JSON.stringify(businessCase)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        domain = EXCLUDED.domain,
        level = EXCLUDED.level,
        status = EXCLUDED.status,
        payload_json = EXCLUDED.payload_json
    `;
  }

  for (const day of learningPath.days) {
    await sql`
      INSERT INTO learning_days (id, learning_path_id, day_number, title, domain, competency_ids, lesson_id, exercise_id, minutes, status)
      VALUES (${`${learningPath.id}-day-${day.day}`}, ${learningPath.id}, ${day.day}, ${day.title}, ${day.domainId}, ${day.competencyIds}, ${day.lessonId}, ${day.exerciseId}, ${day.minutes}, ${day.status})
      ON CONFLICT (learning_path_id, day_number) DO UPDATE SET
        title = EXCLUDED.title,
        domain = EXCLUDED.domain,
        competency_ids = EXCLUDED.competency_ids,
        lesson_id = EXCLUDED.lesson_id,
        exercise_id = EXCLUDED.exercise_id,
        minutes = EXCLUDED.minutes,
        status = EXCLUDED.status
    `;
  }

  // Curriculum versions and their levels are catalogue data: global, no owner,
  // no row level security. Validating before writing means a malformed track
  // fails the seed instead of producing levels nobody can clear.
  for (const version of curriculumVersions) {
    assertValidCurriculum(version);

    await sql`
      INSERT INTO curriculum_versions (id, label, effective_from, rules_json)
      VALUES (${version.id}, ${version.label}, ${version.effectiveFrom}, ${JSON.stringify(version.rules)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET
        label = EXCLUDED.label,
        effective_from = EXCLUDED.effective_from,
        rules_json = EXCLUDED.rules_json
    `;

    for (const level of version.levels) {
      await sql`
        INSERT INTO module_levels (
          id, curriculum_version_id, track_id, module_id, domain, level, title, objective,
          competency_ids, critical_competency_ids, estimated_minutes, publication_status
        )
        VALUES (
          ${level.id}, ${version.id}, ${level.trackId}, ${level.moduleId}, ${level.domainId},
          ${level.level}, ${level.title}, ${level.objective}, ${level.competencyIds},
          ${level.criticalCompetencyIds}, ${level.estimatedMinutes}, ${level.publicationStatus}
        )
        ON CONFLICT (id) DO UPDATE SET
          curriculum_version_id = EXCLUDED.curriculum_version_id,
          track_id = EXCLUDED.track_id,
          module_id = EXCLUDED.module_id,
          domain = EXCLUDED.domain,
          level = EXCLUDED.level,
          title = EXCLUDED.title,
          objective = EXCLUDED.objective,
          competency_ids = EXCLUDED.competency_ids,
          critical_competency_ids = EXCLUDED.critical_competency_ids,
          estimated_minutes = EXCLUDED.estimated_minutes,
          publication_status = EXCLUDED.publication_status
      `;
    }
  }

  // Authored evaluation specifications. Validated before writing, so a malformed
  // spec fails the seed rather than surfacing when a learner submits an answer.
  // An exercise absent from this list keeps the previous grader (legacy_rubric).
  assertValidAuthoredVersions();

  for (const version of authoredExerciseVersions) {
    await sql`
      INSERT INTO exercise_versions (id, exercise_id, version, evaluation_type, spec_json, is_active)
      VALUES (${version.id}, ${version.exerciseId}, ${version.version}, ${version.evaluationType},
              ${JSON.stringify(version.spec)}::jsonb, true)
      ON CONFLICT (id) DO UPDATE SET
        evaluation_type = EXCLUDED.evaluation_type,
        spec_json = EXCLUDED.spec_json,
        is_active = EXCLUDED.is_active
    `;

    for (const [index, testCase] of version.testCases.entries()) {
      await sql`
        INSERT INTO exercise_test_cases (id, exercise_version_id, name, submission_json, expected_score, expected_outcomes_json)
        VALUES (${`${version.id}-case-${index + 1}`}, ${version.id}, ${testCase.name},
                ${JSON.stringify(testCase.submission)}::jsonb, ${testCase.expectedScore},
                ${JSON.stringify(testCase.expectedOutcomes ?? {})}::jsonb)
        ON CONFLICT (exercise_version_id, name) DO UPDATE SET
          submission_json = EXCLUDED.submission_json,
          expected_score = EXCLUDED.expected_score,
          expected_outcomes_json = EXCLUDED.expected_outcomes_json
      `;
    }
  }

  console.log("Seeded Finance Learning Hub reference data.");
} finally {
  await sql.end();
}
