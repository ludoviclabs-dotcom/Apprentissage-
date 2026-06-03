export const migrationFiles = ["migrations/0001_init.sql"] as const;

export const tables = [
  "source_packs",
  "documents",
  "document_pages",
  "chunks",
  "embeddings",
  "concepts",
  "chunk_concepts",
  "competencies",
  "learning_paths",
  "lessons",
  "lesson_sources",
  "learning_days",
  "exercises",
  "attempts",
  "corrections",
  "simulations",
  "revision_items"
] as const;

export type TableName = (typeof tables)[number];

export interface DbHealth {
  engine: "postgres";
  extension: "pgvector";
  migrationCount: number;
  tableCount: number;
}

export function getDbHealth(): DbHealth {
  return {
    engine: "postgres",
    extension: "pgvector",
    migrationCount: migrationFiles.length,
    tableCount: tables.length
  };
}
