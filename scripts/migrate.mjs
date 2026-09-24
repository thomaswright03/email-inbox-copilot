// Applies migrations/*.sql in order and grants the runtime role only the
// DML each table needs. Run with the database OWNER connection:
//
//   MIGRATION_DATABASE_URL=postgres://owner... APP_DB_ROLE=inbox_app npm run db:migrate
//
// The runtime role itself (CREATE ROLE inbox_app LOGIN PASSWORD ...) is
// created once by the operator so its password never appears in the repo;
// see SECURITY.md. DATABASE_URL for the app must then use that role.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (the owner connection string) is required");
  process.exit(1);
}
const appRole = process.env.APP_DB_ROLE ?? "inbox_app";
if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appRole)) {
  console.error("APP_DB_ROLE must be a plain lowercase identifier");
  process.exit(1);
}

const sql = neon(url);
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "migrations");

// One statement per query (the HTTP driver doesn't run multi-statement text).
function statements(text) {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

await sql.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
const applied = new Set((await sql.query("SELECT name FROM schema_migrations")).map((r) => r.name));

for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) continue;
  for (const stmt of statements(await readFile(path.join(dir, file), "utf8"))) {
    await sql.query(stmt);
  }
  await sql.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
  console.log(`applied ${file}`);
}

const roleExists = (await sql.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appRole])).length > 0;
if (!roleExists) {
  console.warn(`Role ${appRole} does not exist yet; create it (see SECURITY.md) and re-run to apply grants.`);
  process.exit(0);
}

const grants = [
  `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${appRole}`,
  `REVOKE CREATE ON SCHEMA public FROM ${appRole}`,
  `REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
  `GRANT USAGE ON SCHEMA public TO ${appRole}`,
  // Append-only audit trail: the app can add rows but not read, change or erase them.
  `GRANT INSERT ON audit_log TO ${appRole}`,
  `GRANT USAGE ON SEQUENCE audit_log_id_seq TO ${appRole}`,
  // Retention: rows past the retention period only, via a definer function.
  `GRANT EXECUTE ON FUNCTION purge_audit_log(integer) TO ${appRole}`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON response_cache TO ${appRole}`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limit TO ${appRole}`,
  `GRANT SELECT, INSERT, UPDATE ON user_sessions TO ${appRole}`,
];
for (const g of grants) await sql.query(g);
console.log(`granted least-privilege DML to ${appRole}`);
