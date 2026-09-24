import { getSql } from "./db";
import { logError } from "./log";

// Server-side session generations, so one user's sessions can be revoked
// without rotating AUTH_SECRET. Each session cookie records the version that
// was current when it was issued; sign-out (auth.ts) and
// scripts/revoke-sessions.mjs bump it, and lib/session.ts rejects any
// cookie carrying an older version.
//
// With DATABASE_URL unset there is no server-side store: sessions then rely
// only on the short cookie lifetime and Google-side revocation at sign-out.

export async function currentSessionVersion(googleId: string): Promise<number | null> {
  const sql = getSql();
  if (!sql) return null;
  // A new row starts at the current Unix time rather than 1, so a row that
  // was purged and later recreated never reissues a version an old cookie
  // could still carry.
  const rows = await sql`
    INSERT INTO user_sessions (google_id, version) VALUES (${googleId}, floor(extract(epoch from now()))::integer)
    ON CONFLICT (google_id) DO UPDATE SET updated_at = now()
    RETURNING version
  `;
  // Rows expire 30 days after the last sign-in (migrations/002).
  if (Math.random() < 0.05) {
    await sql`SELECT purge_user_sessions()`.catch((err) => logError("session-store.purge", err));
  }
  return Number((rows[0] as { version: number }).version);
}

export type SessionCheck = "valid" | "revoked" | "unavailable";

// Fails closed: if the store is configured but can't be read, the session
// is not accepted.
export async function checkSessionVersion(googleId: string, version: unknown): Promise<SessionCheck> {
  const sql = getSql();
  if (!sql) return "valid";
  try {
    const rows = await sql`SELECT version FROM user_sessions WHERE google_id = ${googleId}`;
    if (rows.length === 0) return "revoked";
    return Number((rows[0] as { version: number }).version) === version ? "valid" : "revoked";
  } catch (err) {
    logError("session-store.check", err);
    return "unavailable";
  }
}

export async function revokeUserSessions(googleId: string): Promise<void> {
  const sql = getSql();
  if (!sql) return;
  try {
    await sql`
      INSERT INTO user_sessions (google_id, version) VALUES (${googleId}, floor(extract(epoch from now()))::integer + 1)
      ON CONFLICT (google_id) DO UPDATE SET version = user_sessions.version + 1, updated_at = now()
    `;
  } catch (err) {
    logError("session-store.revoke", err);
  }
}
