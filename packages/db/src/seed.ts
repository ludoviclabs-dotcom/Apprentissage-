import postgres from "postgres";
import { competencies, documents, exercises, sourcePacks } from "@finance/domain";

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

  for (const exercise of exercises) {
    await sql`
      INSERT INTO exercises (id, domain, topic, level, estimated_minutes, statement, expected_answer, rubric_json, competency_ids, source_chunk_ids)
      VALUES (${exercise.id}, ${exercise.domainId}, ${exercise.title}, ${exercise.level}, ${exercise.estimatedMinutes}, ${exercise.statement}, ${exercise.expectedAnswer}, ${JSON.stringify(exercise.rubric)}::jsonb, ${exercise.competencyIds}, ${exercise.sourceChunkIds})
      ON CONFLICT (id) DO UPDATE SET
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

  console.log("Seeded Finance Learning Hub reference data.");
} finally {
  await sql.end();
}
