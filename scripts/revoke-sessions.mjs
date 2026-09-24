// Immediately invalidates every session of one user, without rotating
// AUTH_SECRET (which would sign out everyone):
//
//   DATABASE_URL=... node scripts/revoke-sessions.mjs <google-account-id>
//
// The Google account id is the `google_id` in user_sessions (also the id in
// the user's cache keys). Their next request gets a 401 and they must sign
// in again. To also cut Gmail access, the user (or a Workspace admin) should
// remove the app at https://myaccount.google.com/permissions.
import { neon } from "@neondatabase/serverless";

const [googleId] = process.argv.slice(2);
if (!googleId || !/^[0-9A-Za-z_-]{1,128}$/.test(googleId)) {
  console.error("usage: node scripts/revoke-sessions.mjs <google-account-id>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
const sql = neon(url);
const rows = await sql.query(
  "INSERT INTO user_sessions (google_id, version) VALUES ($1, floor(extract(epoch from now()))::integer + 1) ON CONFLICT (google_id) DO UPDATE SET version = user_sessions.version + 1, updated_at = now() RETURNING version",
  [googleId]
);
console.log(`sessions for ${googleId} revoked (now at version ${rows[0].version})`);
