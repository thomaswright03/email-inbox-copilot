import { getSql } from "./db";
import { seal, unseal } from "./crypto";
import { logError } from "./log";

// A shared, multi-instance-safe cache layer on top of the same optional
// Postgres connection lib/audit.ts uses. lib/cache.ts (in-memory) remains
// the fast L1 in front of this — this is the L2: it survives cold starts
// and is shared across serverless instances, closing the gap a purely
// in-memory cache has under real horizontal scaling. Like the audit log,
// it's best-effort: any failure here just means a cache miss, never a
// broken request.
//
// Values are inbox-derived (senders, subjects, previews, AI summaries), so
// they are stored encrypted (lib/crypto.ts), bound to their key so a row
// can't be replayed under another user's key, and expired rows are deleted
// rather than left behind.
const PURPOSE = "response-cache";


export async function getCachedDb<T>(key: string): Promise<T | undefined> {
  try {
    const sql = getSql();
    if (!sql) return undefined;
    const rows = await sql`
      SELECT value FROM response_cache WHERE key = ${key} AND expires_at > now()
    `;
    if (rows.length === 0) return undefined;
    return unseal<T>((rows[0] as { value: unknown }).value, PURPOSE, key);
  } catch (err) {
    logError("db-cache.read", err);
    return undefined;
  }
}

export async function setCachedDb<T>(key: string, value: T, ttlMs: number): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    const sealed = seal(value, PURPOSE, key);
    // Without an encryption key, inbox data is not written to the database.
    if (!sealed) return;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await sql`
      INSERT INTO response_cache (key, value, expires_at)
      VALUES (${key}, ${JSON.stringify(sealed)}::jsonb, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
    `;
    await sql`DELETE FROM response_cache WHERE expires_at <= now()`;
  } catch (err) {
    logError("db-cache.write", err);
  }
}

export async function invalidateCachedDb(key: string): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    await sql`DELETE FROM response_cache WHERE key = ${key}`;
  } catch (err) {
    logError("db-cache.invalidate", err);
  }
}

export async function invalidateCachedDbByPrefix(prefix: string): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    await sql`DELETE FROM response_cache WHERE starts_with(key, ${prefix})`;
  } catch (err) {
    logError("db-cache.invalidate-prefix", err);
  }
}
