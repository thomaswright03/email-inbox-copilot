// Answers a user's request for a copy of, or deletion of, the data Inbox
// Buddy holds about them (Privacy Policy, "Your choices and rights").
//
// 1. Check the request. Users send it from the dashboard's "Your data" link,
//    which includes a signed request code. Verify it with the production
//    AUTH_SECRET, and check that the email inside matches the address the
//    request came from:
//
//      AUTH_SECRET=... node scripts/user-data.mjs verify <request-code>
//
//    A request without a valid code can't be matched to an account (nothing
//    stored maps email addresses to account ids): reply asking the person
//    to sign in and use the "Your data" link.
//
// 2. Export or delete, with the database OWNER connection, because the app's
//    own role can't read or delete audit_log or consent_records:
//
//      MIGRATION_DATABASE_URL=postgres://owner... node scripts/user-data.mjs export <google-account-id> > export.json
//      MIGRATION_DATABASE_URL=postgres://owner... node scripts/user-data.mjs delete <google-account-id>
//
// Tables covered: audit_log, consent_records, user_sessions,
// ignored_messages (Not spam choices), response_cache (keys
// "<kind>:<id>:..." for every kind in lib/user-key-kinds.mjs USER_KEY_KINDS,
// the same list the app writes and purges at sign-out: today's messages,
// summary, spam list and triage (briefing), and the spam verdicts; values are
// encrypted and expire within 5 minutes, or 26 hours for spam verdicts, so
// only keys and expiry are exported) and rate_limit (buckets "<rule>:<id>").
// Nothing else in the database, and
// nothing outside it except the host's log drain, holds per-user data;
// log lines expire under the host's own log retention.
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { userCacheKeyPatterns } from "../lib/user-key-kinds.mjs";

const [command, arg] = process.argv.slice(2);

// Same format and key derivation as lib/data-request.ts.
if (command === "verify") {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !arg) {
    console.error("usage: AUTH_SECRET=... node scripts/user-data.mjs verify <request-code>");
    process.exit(1);
  }
  const [payload, mac, extra] = arg.trim().split(".");
  const key = Buffer.from(hkdfSync("sha256", secret, "inbox-buddy", "inbox-buddy:data-request", 32));
  const expected = Buffer.from(createHmac("sha256", key).update(payload ?? "").digest("base64url"));
  const given = Buffer.from(mac ?? "");
  if (!payload || extra !== undefined || expected.length !== given.length || !timingSafeEqual(expected, given)) {
    console.error("INVALID: this code was not issued by this deployment (or AUTH_SECRET has been rotated since).");
    process.exit(2);
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  console.log(`valid code for account id ${claims.u}, email ${claims.e}, issued ${new Date(claims.t * 1000).toISOString()}`);
  console.log("Act only if the request came from that email address.");
  process.exit(0);
}

const googleId = arg;
if (!["export", "delete"].includes(command) || !googleId || !/^[0-9A-Za-z_-]{1,128}$/.test(googleId)) {
  console.error("usage: node scripts/user-data.mjs verify <request-code> | export <google-account-id> | delete <google-account-id>");
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
// One pattern per per-user cache kind (lib/user-key-kinds.mjs).
const cachePatterns = userCacheKeyPatterns(googleId);
const ratePattern = `%:${likeId}`;

if (command === "export") {
  const [audit, consent, sessions, notSpam, cache, rate] = await Promise.all([
    sql.query("SELECT action, message_id, detail, created_at FROM audit_log WHERE user_id = $1 ORDER BY created_at", [googleId]),
    sql.query("SELECT legal_version, accepted_at FROM consent_records WHERE google_id = $1 ORDER BY accepted_at", [googleId]),
    sql.query("SELECT version, updated_at FROM user_sessions WHERE google_id = $1", [googleId]),
    sql.query("SELECT message_id, created_at FROM ignored_messages WHERE google_id = $1 ORDER BY created_at", [googleId]),
    sql.query("SELECT key, expires_at FROM response_cache WHERE key LIKE ANY($1::text[]) ORDER BY key", [cachePatterns]),
    sql.query("SELECT bucket, window_start, count FROM rate_limit WHERE bucket LIKE $1", [ratePattern]),
  ]);
  const report = {
    googleAccountId: googleId,
    exportedAt: new Date().toISOString(),
    auditLog: audit,
    consentRecords: consent,
    sessionVersion: sessions,
    notSpamChoices: notSpam,
    cachedInboxData: cache.map((row) => ({ ...row, note: "encrypted inbox metadata, briefing (AI notes and dates) or spam verdicts, deleted at expiry" })),
    rateLimitCounters: rate,
  };
  console.log(JSON.stringify(report, null, 2));
} else {
  // One transaction, so a failure part-way deletes nothing.
  const results = await sql.transaction([
    sql.query("DELETE FROM audit_log WHERE user_id = $1", [googleId]),
    sql.query("DELETE FROM consent_records WHERE google_id = $1", [googleId]),
    sql.query("DELETE FROM user_sessions WHERE google_id = $1", [googleId]),
    sql.query("DELETE FROM ignored_messages WHERE google_id = $1", [googleId]),
    sql.query("DELETE FROM response_cache WHERE key LIKE ANY($1::text[])", [cachePatterns]),
    sql.query("DELETE FROM rate_limit WHERE bucket LIKE $1", [ratePattern]),
  ], { fullResults: true });
  const [audit, consent, sessions, notSpam, cache, rate] = results.map((r) => r.rowCount ?? 0);
  // Deleting the user_sessions row also ends any session still open for
  // this account: lib/session.ts rejects a cookie with no recorded version.
  console.log(
    `deleted for ${googleId}: audit_log ${audit}, consent_records ${consent}, user_sessions ${sessions}, ignored_messages ${notSpam}, response_cache ${cache}, rate_limit ${rate}`
  );
  console.log("Tell the user to remove Inbox Buddy at https://myaccount.google.com/permissions if they haven't already.");
}
