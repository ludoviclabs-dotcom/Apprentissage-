import postgres from "postgres";
import {
  businessCases,
  competencies,
  documents,
  examSessions,
  exercises,
  flashcards,
  learningModules,
  learningPath,
  lessons,
  sourcePacks
} from "@finance/domain";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL is not set. Start Docker Compose and copy .env.example to .env first.");
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

  console.log("Seeded Finance Learning Hub reference data.");
} finally {
  await sql.end();
}
