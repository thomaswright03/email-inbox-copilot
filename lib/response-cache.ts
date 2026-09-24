import { getCached, setCached, invalidateCached, invalidateCachedByPrefix } from "./cache";
import { getCachedDb, setCachedDb, invalidateCachedDb, invalidateCachedDbByPrefix } from "./db-cache";

// Every per-user cache key starts with one of these, followed by the user's
// stable Google account id — see userCacheKey().
const USER_KEY_KINDS = ["today", "spam"] as const;
export type UserCacheKind = (typeof USER_KEY_KINDS)[number];

export function userCacheKey(kind: UserCacheKind, userId: string, date = new Date()): string {
  if (!userId) throw new Error("userCacheKey requires a user id");
  return `${kind}:${userId}:${date.toISOString().slice(0, 10)}`;
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
export async function getOrSetCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const memHit = getCached<T>(key);
  if (memHit !== undefined) return memHit;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const run = (async () => {
    const dbHit = await getCachedDb<T>(key);
    if (dbHit !== undefined) {
      setCached(key, dbHit, ttlMs);
      return dbHit;
    }

    const value = await fetcher();
    setCached(key, value, ttlMs);
    await setCachedDb(key, value, ttlMs);
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
