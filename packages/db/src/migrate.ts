import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { migrationFiles } from "./schema";

// Schema changes must be applied by the database owner. The web app itself
// deliberately connects through the constrained role in DATABASE_URL.
const databaseUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_ADMIN_URL (or DATABASE_URL for local setup) is not set. Start Docker Compose and copy .env.example to .env first.");
  process.exit(0);
}

const sql = postgres(databaseUrl, { max: 1 });
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  for (const file of migrationFiles) {
    const migrationPath = resolve(packageRoot, file);
    const migrationSql = await readFile(migrationPath, "utf8");
    await sql.unsafe(migrationSql);
    console.log(`Applied ${file}`);
  }
} finally {
  await sql.end();
}
