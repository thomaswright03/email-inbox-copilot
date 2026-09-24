import { getSql } from "./db";
import { emit, logError } from "./log";

export type AuditAction =
  | "delete"
  | "unsubscribe"
  | "ignore"
  | "classified_spam"
  | "sign_in"
  | "sign_in_rejected"
  | "sign_out"
  | "token_refresh_failed"
  | "consent_accepted"
  | "undo";

// The logger below is deliberately silent when unconfigured, so nothing
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
    logError("audit.health", err);
    return { configured: true, reachable: false };
  }
}

// Audit logging is best-effort: a logging failure should never block the
// user-facing action it's recording. Every event is also written as one
// structured log line, so it reaches the host's log drain even when
// DATABASE_URL isn't configured. The table is append-only for the app's
// database role (see migrations/ and scripts/migrate.mjs).
//
// Rows identify the user by Google account id, never by email address, and
// `detail` only ever holds one of the fixed strings the app itself writes
// (no model output, no email content). Rows older than AUDIT_RETENTION_DAYS
// (default 90) are deleted through the purge_audit_log() database function,
// the only delete the app's role can perform on this table.
const RETENTION_DAYS = (() => {
  const n = Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 90;
})();

export async function logAuditEvent(entry: {
  userId: string;
  action: AuditAction;
  messageId?: string;
  detail?: string;
}): Promise<void> {
  emit("info", {
    level: "audit",
    action: entry.action,
    user: entry.userId,
    ...(entry.messageId ? { messageId: entry.messageId } : {}),
    ...(entry.detail ? { detail: entry.detail } : {}),
  });
  try {
    const sql = getSql();
    if (!sql) return;
    await sql`
      INSERT INTO audit_log (user_id, action, message_id, detail)
      VALUES (${entry.userId}, ${entry.action}, ${entry.messageId ?? null}, ${entry.detail ?? null})
    `;
    if (Math.random() < 0.02) {
      await sql`SELECT purge_audit_log(${RETENTION_DAYS})`;
    }
  } catch (err) {
    logError("audit.write", err);
  }
}
