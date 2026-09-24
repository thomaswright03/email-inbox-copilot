import { getCached, setCached, invalidateCached, invalidateCachedByPrefix } from "./cache";
import { getCachedDb, setCachedDb, invalidateCachedDb, invalidateCachedDbByPrefix } from "./db-cache";
import type { LocalDay } from "./local-day";

// Every per-user cache key starts with one of these, followed by the user's
// stable Google account id — see userCacheKey() (and lib/verdict-cache.ts
// for "verdicts"). "triage" is the model's answer for the day's inbox
// (lib/triage.ts); it is not dropped when the mailbox changes, because an
// email leaving the inbox doesn't change what the model said about the rest.
const INBOX_KEY_KINDS = ["messages", "today", "spam"] as const;
const CACHE_KINDS = [...INBOX_KEY_KINDS, "triage"] as const;
const USER_KEY_KINDS = [...CACHE_KINDS, "verdicts"] as const;
export type UserCacheKind = (typeof CACHE_KINDS)[number];

// A LocalDay keys the entry to the user's own date and time zone, so it
// rolls over at their midnight; a Date uses its UTC date.
export function userCacheKey(kind: UserCacheKind, userId: string, day: LocalDay | Date = new Date(), variant?: string): string {
  if (!userId) throw new Error("userCacheKey requires a user id");
  const dayKey = day instanceof Date ? day.toISOString().slice(0, 10) : `${day.date}:${day.timeZone}`;
  return `${kind}:${userId}:${dayKey}${variant ? `:${variant}` : ""}`;
}

// Concurrent misses for the same key share one fetch, so a burst of parallel
// requests can't fan out into a burst of Gmail/Gemini calls.
const inflight = new Map<string, Promise<unknown>>();

// Checks the fast in-memory cache first (free, but per-instance and lost on
// cold start), then the shared Postgres-backed cache (survives cold starts,
// shared across instances — a no-op if DATABASE_URL isn't set), and only
// calls `fetcher` on a full miss. Populates both layers on a miss so the
// next request on *any* instance can skip straight to L1 or L2 instead of
// re-hitting Gmail/Gemini.
//
// `reuse` can turn down a cached value (it is then fetched again), and
// `store` can keep a fetched value out of the cache (e.g. a failure that
// should be retried on the next request).
export async function getOrSetCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  { reuse = () => true, store = () => true }: { reuse?: (value: T) => boolean; store?: (value: T) => boolean } = {}
): Promise<T> {
  const memHit = getCached<T>(key);
  if (memHit !== undefined && reuse(memHit)) return memHit;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    const dbHit = memHit === undefined ? await getCachedDb<T>(key) : undefined;
    if (dbHit !== undefined && reuse(dbHit)) {
      setCached(key, dbHit, ttlMs);
      return dbHit;
    }

    const value = await fetcher();
    if (store(value)) {
      setCached(key, value, ttlMs);
      await setCachedDb(key, value, ttlMs);
    }
    return value;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

export async function invalidateCachedEverywhere(key: string): Promise<void> {
  invalidateCached(key);
  await invalidateCachedDb(key);
}

// Reads a cached value from either layer without fetching on a miss.
export async function peekCached<T>(key: string): Promise<T | undefined> {
  return getCached<T>(key) ?? (await getCachedDb<T>(key));
}

// Drops one user's cached inbox data (on Refresh, and after an action
// changes the mailbox) so the next read goes back to Gmail. Spam verdicts
// stay: a message's verdict doesn't change because it was reloaded.
export async function invalidateUserInbox(userId: string, kinds: readonly UserCacheKind[] = INBOX_KEY_KINDS): Promise<void> {
  await Promise.all(
    kinds.map(async (kind) => {
      // By prefix, so every variant (e.g. each summary language) goes too.
      const prefix = `${kind}:${userId}:`;
      invalidateCachedByPrefix(prefix);
      await invalidateCachedDbByPrefix(prefix);
    })
  );
}

export async function purgeUserCaches(userId: string): Promise<void> {
  if (!userId) return;
  await Promise.all(
    USER_KEY_KINDS.map(async (kind) => {
      const prefix = `${kind}:${userId}:`;
      invalidateCachedByPrefix(prefix);
      await invalidateCachedDbByPrefix(prefix);
    })
  );
}
