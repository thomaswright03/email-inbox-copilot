import { getSql } from "./db";
import type { Sql } from "./db";

// A shared, multi-instance-safe cache layer on top of the same optional
// Postgres connection lib/audit.ts uses. lib/cache.ts (in-memory) remains
// the fast L1 in front of this — this is the L2: it survives cold starts
// and is shared across serverless instances, closing the gap a purely
// in-memory cache has under real horizontal scaling. Like the audit log,
// it's best-effort: any failure here just means a cache miss, never a
// broken request.
let schemaReady: Promise<void> | null = null;

async function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS response_cache (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `.then(() => undefined);
  }
  await schemaReady;
}

export async function getCachedDb<T>(key: string): Promise<T | undefined> {
  try {
    const sql = getSql();
    if (!sql) return undefined;
    await ensureSchema(sql);
    const rows = await sql`
      SELECT value FROM response_cache WHERE key = ${key} AND expires_at > now()
    `;
    if (rows.length === 0) return undefined;
    return (rows[0] as { value: T }).value;
  } catch (err) {
    console.error("db cache read failed", err);
    return undefined;
  }
}

export async function setCachedDb<T>(key: string, value: T, ttlMs: number): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    await ensureSchema(sql);
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await sql`
      INSERT INTO response_cache (key, value, expires_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
    `;
  } catch (err) {
    console.error("db cache write failed", err);
  }
}

export async function invalidateCachedDb(key: string): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    await ensureSchema(sql);
    await sql`DELETE FROM response_cache WHERE key = ${key}`;
  } catch (err) {
    console.error("db cache invalidate failed", err);
  }
}
