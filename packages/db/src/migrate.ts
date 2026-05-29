import { migrationFiles } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log("DATABASE_URL is not set. Start Docker Compose and copy .env.example to .env first.");
}

console.log("Available migrations:");

for (const file of migrationFiles) {
  console.log(`- ${file}`);
}

console.log("Apply the SQL with psql or wire this package to a migration runner in the next iteration.");
