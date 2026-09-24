import { getCached, setCached } from "./cache";
import { getCachedDb, setCachedDb } from "./db-cache";
import type { SpamReason } from "./spam-reasons";

// AI spam verdicts per Gmail message, kept for a little over a day (the
// dashboard shows today's mail, since the user's local midnight), so the
// spam list doesn't ask Gemini again on every load or Refresh. Stored like the response cache: in
// memory and encrypted in Postgres, and deleted at sign-out
// (lib/response-cache.ts purgeUserCaches). Only message ids, the yes/no
// verdict and its fixed reason are kept, never message content.
export const VERDICT_TTL_MS = 26 * 60 * 60 * 1000;

export type CachedVerdict = { isSpam: boolean; reason: SpamReason };
type Stored = Record<string, CachedVerdict & { at: number }>;

// The model id is part of the key, so switching models re-checks everything.
export function verdictCacheKey(userId: string, model: string): string {
  if (!userId) throw new Error("verdictCacheKey requires a user id");
  return `verdicts:${userId}:${model}`;
}

async function read(key: string): Promise<Stored> {
  return getCached<Stored>(key) ?? (await getCachedDb<Stored>(key)) ?? {};
}

export async function cachedVerdicts(userId: string, model: string): Promise<Map<string, CachedVerdict>> {
  const now = Date.now();
  const stored = await read(verdictCacheKey(userId, model));
  const out = new Map<string, CachedVerdict>();
  for (const [id, v] of Object.entries(stored)) {
    if (now - v.at < VERDICT_TTL_MS) out.set(id, { isSpam: v.isSpam, reason: v.reason });
  }
  return out;
}

export async function rememberVerdicts(
  userId: string,
  model: string,
  verdicts: readonly ({ id: string } & CachedVerdict)[]
): Promise<void> {
  if (verdicts.length === 0) return;
  const key = verdictCacheKey(userId, model);
  const now = Date.now();
  const stored = await read(key);
  const next: Stored = {};
  for (const [id, v] of Object.entries(stored)) if (now - v.at < VERDICT_TTL_MS) next[id] = v;
  for (const v of verdicts) next[v.id] = { isSpam: v.isSpam, reason: v.reason, at: now };
  setCached(key, next, VERDICT_TTL_MS);
  await setCachedDb(key, next, VERDICT_TTL_MS);
}
