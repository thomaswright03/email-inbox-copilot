import { getSql } from "./db";
import { logError } from "./log";

// Per-user "Not spam" choices (migrations/003): a message marked Not spam is
// left out of that user's spam cards from then on, across reloads, cache
// expiry and sign-ins. Without DATABASE_URL (local development) the choice
// lives in this instance's memory only.

const RETENTION_DAYS = 7;
const memory = new Map<string, Set<string>>();

export async function markIgnored(userId: string, messageId: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    const set = memory.get(userId) ?? new Set<string>();
    set.add(messageId);
    memory.set(userId, set);
    return;
  }
  await sql`
    INSERT INTO ignored_messages (google_id, message_id) VALUES (${userId}, ${messageId})
    ON CONFLICT (google_id, message_id) DO NOTHING
  `;
  if (Math.random() < 0.05) {
    await sql`DELETE FROM ignored_messages WHERE created_at < now() - make_interval(days => ${RETENTION_DAYS})`.catch(
      (err) => logError("ignored.purge", err)
    );
  }
}

// Undo for Not spam.
export async function unmarkIgnored(userId: string, messageId: string): Promise<void> {
  const sql = getSql();
  if (!sql) {
    memory.get(userId)?.delete(messageId);
    return;
  }
  await sql`DELETE FROM ignored_messages WHERE google_id = ${userId} AND message_id = ${messageId}`;
}

// A failed read leaves nothing out rather than failing the spam list.
export async function ignoredMessageIds(userId: string): Promise<Set<string>> {
  const sql = getSql();
  if (!sql) return new Set(memory.get(userId) ?? []);
  try {
    const rows = await sql`SELECT message_id FROM ignored_messages WHERE google_id = ${userId}`;
    return new Set(rows.map((r) => (r as { message_id: string }).message_id));
  } catch (err) {
    logError("ignored.read", err);
    return new Set();
  }
}
