// Answers a user's request for a copy of, or deletion of, the data Inbox
// Buddy holds about them (Privacy Policy, "Your choices and rights"). Runs
// with the database OWNER connection, because the app's own role can't read
// or delete audit_log or consent_records:
//
//   MIGRATION_DATABASE_URL=postgres://owner... node scripts/user-data.mjs export <google-account-id> > export.json
//   MIGRATION_DATABASE_URL=postgres://owner... node scripts/user-data.mjs delete <google-account-id>
//
// The Google account id is the `sub` of the user's Google account (it is
// the user_id in audit_log and the google_id in user_sessions). To find it
// from an email address, ask the user to sign in once and look for their
// `signin` log line, or check the Google Cloud console's OAuth user list.
// docs/incident-response.md and SECURITY.md describe when to run this.
//
// Tables covered: audit_log, consent_records, user_sessions, response_cache
// (keys "today:<id>:..." and "spam:<id>:..."; values are encrypted and
// expire within 5 minutes, so only keys and expiry are exported) and
// rate_limit (buckets "<rule>:<id>"). Nothing else in the database, and
// nothing outside it except the host's log drain, holds per-user data;
// log lines expire under the host's own log retention.
import { neon } from "@neondatabase/serverless";

const [command, googleId] = process.argv.slice(2);
if (!["export", "delete"].includes(command) || !googleId || !/^[0-9A-Za-z_-]{1,128}$/.test(googleId)) {
  console.error("usage: node scripts/user-data.mjs export|delete <google-account-id>");
  process.exit(1);
}
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (the database owner connection) is required");
  process.exit(1);
}
const sql = neon(url);

// LIKE patterns: escape the wildcard characters an id may contain.
const likeId = googleId.replace(/[\\%_]/g, (c) => `\\${c}`);
const cachePatterns = [`today:${likeId}:%`, `spam:${likeId}:%`];
const ratePattern = `%:${likeId}`;

if (command === "export") {
  const [audit, consent, sessions, cache, rate] = await Promise.all([
    sql.query("SELECT action, message_id, detail, created_at FROM audit_log WHERE user_id = $1 ORDER BY created_at", [googleId]),
    sql.query("SELECT legal_version, accepted_at FROM consent_records WHERE google_id = $1 ORDER BY accepted_at", [googleId]),
    sql.query("SELECT version, updated_at FROM user_sessions WHERE google_id = $1", [googleId]),
    sql.query("SELECT key, expires_at FROM response_cache WHERE key LIKE $1 OR key LIKE $2", cachePatterns),
    sql.query("SELECT bucket, window_start, count FROM rate_limit WHERE bucket LIKE $1", [ratePattern]),
  ]);
  const report = {
    googleAccountId: googleId,
    exportedAt: new Date().toISOString(),
    auditLog: audit,
    consentRecords: consent,
    sessionVersion: sessions,
    cachedInboxData: cache.map((row) => ({ ...row, note: "encrypted inbox metadata or summary, deleted at expiry" })),
    rateLimitCounters: rate,
  };
  console.log(JSON.stringify(report, null, 2));
} else {
  // One transaction, so a failure part-way deletes nothing.
  const results = await sql.transaction([
    sql.query("DELETE FROM audit_log WHERE user_id = $1", [googleId]),
    sql.query("DELETE FROM consent_records WHERE google_id = $1", [googleId]),
    sql.query("DELETE FROM user_sessions WHERE google_id = $1", [googleId]),
    sql.query("DELETE FROM response_cache WHERE key LIKE $1 OR key LIKE $2", cachePatterns),
    sql.query("DELETE FROM rate_limit WHERE bucket LIKE $1", [ratePattern]),
  ], { fullResults: true });
  const [audit, consent, sessions, cache, rate] = results.map((r) => r.rowCount ?? 0);
  // Deleting the user_sessions row also ends any session still open for
  // this account: lib/session.ts rejects a cookie with no recorded version.
  console.log(
    `deleted for ${googleId}: audit_log ${audit}, consent_records ${consent}, user_sessions ${sessions}, response_cache ${cache}, rate_limit ${rate}`
  );
  console.log("Tell the user to remove Inbox Buddy at https://myaccount.google.com/permissions if they haven't already.");
}
