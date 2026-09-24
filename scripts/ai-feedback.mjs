// Daily false-positive signal for the AI spam flags: of the cards the AI
// flagged each day, how many the user then marked Not spam (and didn't
// undo). A rising rate after a model or prompt change means the model got
// worse. Run with the database OWNER connection, because the app's own role
// can't read the activity log:
//
//   MIGRATION_DATABASE_URL=postgres://owner... node scripts/ai-feedback.mjs [days]
//
// It reads only audit_log rows the app already writes: "classified_spam"
// with detail "flagged by AI" (app/api/emails/spam/route.ts), "ignore" (Not
// spam) and "undo" with detail "not spam". Without a database, the same
// events are in the host's log drain as `"level":"audit"` lines.
import { neon } from "@neondatabase/serverless";

const days = Number.parseInt(process.argv[2] ?? "30", 10);
if (!Number.isInteger(days) || days < 1 || days > 366) {
  console.error("usage: node scripts/ai-feedback.mjs [days, 1-366, default 30]");
  process.exit(1);
}
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) {
  console.error("MIGRATION_DATABASE_URL (the database owner connection) is required");
  process.exit(1);
}
const sql = neon(url);

// A card counts on the day the AI first flagged it; it counts as rejected
// if the user marked it Not spam afterwards and didn't undo that.
const rows = await sql.query(
  `WITH flagged AS (
     SELECT user_id, message_id, min(created_at) AS flagged_at
     FROM audit_log
     WHERE action = 'classified_spam' AND detail = 'flagged by AI' AND created_at >= now() - make_interval(days => $1)
     GROUP BY user_id, message_id
   ),
   rejected AS (
     SELECT DISTINCT i.user_id, i.message_id
     FROM audit_log i
     WHERE i.action = 'ignore'
       AND NOT EXISTS (
         SELECT 1 FROM audit_log u
         WHERE u.user_id = i.user_id AND u.message_id = i.message_id
           AND u.action = 'undo' AND u.detail = 'not spam' AND u.created_at > i.created_at
       )
   )
   SELECT to_char(date_trunc('day', f.flagged_at), 'YYYY-MM-DD') AS day,
          count(*)::int AS ai_flagged,
          count(r.message_id)::int AS marked_not_spam
   FROM flagged f
   LEFT JOIN rejected r ON r.user_id = f.user_id AND r.message_id = f.message_id
   GROUP BY 1
   ORDER BY 1 DESC`,
  [days]
);

console.log("day         AI-flagged  marked Not spam  Not-spam rate");
for (const r of rows) {
  const rate = r.ai_flagged ? ((100 * r.marked_not_spam) / r.ai_flagged).toFixed(1) : "0.0";
  console.log(`${r.day}  ${String(r.ai_flagged).padStart(10)}  ${String(r.marked_not_spam).padStart(15)}  ${rate.padStart(12)}%`);
}
if (rows.length === 0) console.log(`(no AI-flagged cards in the last ${days} days)`);
