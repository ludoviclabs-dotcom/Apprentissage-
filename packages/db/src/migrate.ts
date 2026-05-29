import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { migrationFiles } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL is not set. Start Docker Compose and copy .env.example to .env first.");
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
