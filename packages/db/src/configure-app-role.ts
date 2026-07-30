import postgres from "postgres";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appUrl = process.env.DATABASE_URL;

if (!adminUrl || !appUrl) {
  console.log("DATABASE_ADMIN_URL and DATABASE_URL are required to configure the constrained application role.");
  process.exit(0);
}

const admin = new URL(adminUrl);
const app = new URL(appUrl);
const roleName = decodeURIComponent(app.username);
const password = decodeURIComponent(app.password);

if (!roleName || !password) {
  throw new Error("DATABASE_URL must contain a username and password for the application role.");
}

if (roleName !== "finance_app") {
  throw new Error("DATABASE_URL must use the dedicated finance_app PostgreSQL role.");
}

if (admin.hostname !== app.hostname || admin.port !== app.port || admin.pathname !== app.pathname) {
  throw new Error("DATABASE_ADMIN_URL and DATABASE_URL must point to the same PostgreSQL database.");
}

const sql = postgres(adminUrl, { max: 1 });

try {
  const [existing] = await sql<{ exists: boolean }[]>`
    select exists(select 1 from pg_roles where rolname = ${roleName}) as exists`;

  const role = quoteIdentifier(roleName);
  const secret = quoteLiteral(password);

  if (existing?.exists) {
    await sql.unsafe(
      `alter role ${role} login nosuperuser nobypassrls nocreatedb nocreaterole noinherit noreplication password ${secret}`
    );
  } else {
    await sql.unsafe(
      `create role ${role} login nosuperuser nobypassrls nocreatedb nocreaterole noinherit noreplication password ${secret}`
    );
  }

  console.log(`Configured constrained application role ${roleName}.`);
} finally {
  await sql.end();
}
