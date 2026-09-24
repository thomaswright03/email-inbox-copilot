import { getSql } from "./db";
import { logError } from "./log";

export type AuditAction =
  | "delete"
  | "unsubscribe"
  | "ignore"
  | "classified_spam"
  | "sign_in"
  | "sign_in_rejected"
  | "sign_out"
  | "token_refresh_failed"
  | "session_rejected"
  | "rate_limited";

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
export async function logAuditEvent(entry: {
  userEmail: string;
  action: AuditAction;
  messageId?: string;
  detail?: string;
}): Promise<void> {
  console.info(
    JSON.stringify({
      level: "audit",
      action: entry.action,
      ...(entry.messageId ? { messageId: entry.messageId } : {}),
      ...(entry.detail ? { detail: entry.detail } : {}),
    })
  );
  try {
    const sql = getSql();
    if (!sql) return;
    await sql`
      INSERT INTO audit_log (user_email, action, message_id, detail)
      VALUES (${entry.userEmail}, ${entry.action}, ${entry.messageId ?? null}, ${entry.detail ?? null})
    `;
  } catch (err) {
    logError("audit.write", err);
  }
}
