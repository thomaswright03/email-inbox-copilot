import { getSql } from "./db";
import type { Sql } from "./db";

export type AuditAction = "delete" | "unsubscribe" | "ignore" | "classified_spam";

let schemaReady: Promise<void> | null = null;

async function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id BIGSERIAL PRIMARY KEY,
        user_email TEXT NOT NULL,
        action TEXT NOT NULL,
        message_id TEXT,
        detail TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.then(() => undefined);
  }
  await schemaReady;
}

// The logger above is deliberately silent when unconfigured, so nothing
// else in the app would ever surface a misconfigured DATABASE_URL — this
// gives an operator a way to actually check, instead of finding out only by
// noticing the audit_log table stays empty. See app/api/health/route.ts.
export async function getAuditLogStatus(): Promise<{ configured: boolean; reachable: boolean }> {
  const sql = getSql();
  if (!sql) return { configured: false, reachable: false };
  try {
    await sql`SELECT 1`;
    return { configured: true, reachable: true };
  } catch (err) {
    console.error("audit log health check failed", err);
    return { configured: true, reachable: false };
  }
}

// Audit logging is best-effort: a logging failure should never block the
// user-facing action it's recording. If DATABASE_URL isn't configured yet,
// this silently no-ops rather than breaking Delete/Unsubscribe/spam listing.
export async function logAuditEvent(entry: {
  userEmail: string;
  action: AuditAction;
  messageId?: string;
  detail?: string;
}): Promise<void> {
  try {
    const sql = getSql();
    if (!sql) return;
    await ensureSchema(sql);
    await sql`
      INSERT INTO audit_log (user_email, action, message_id, detail)
      VALUES (${entry.userEmail}, ${entry.action}, ${entry.messageId ?? null}, ${entry.detail ?? null})
    `;
  } catch (err) {
    console.error("audit log write failed", err);
  }
}
