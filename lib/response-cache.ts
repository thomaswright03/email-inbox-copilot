import { getCached, setCached, invalidateCached } from "./cache";
import { getCachedDb, setCachedDb, invalidateCachedDb } from "./db-cache";

// Checks the fast in-memory cache first (free, but per-instance and lost on
// cold start), then the shared Postgres-backed cache (survives cold starts,
// shared across instances — a no-op if DATABASE_URL isn't set), and only
// calls `fetcher` on a full miss. Populates both layers on a miss so the
// next request on *any* instance can skip straight to L1 or L2 instead of
// re-hitting Gmail/Gemini.
export async function getOrSetCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const memHit = getCached<T>(key);
  if (memHit !== undefined) return memHit;

  const dbHit = await getCachedDb<T>(key);
  if (dbHit !== undefined) {
    setCached(key, dbHit, ttlMs);
    return dbHit;
  }

  const value = await fetcher();
  setCached(key, value, ttlMs);
  await setCachedDb(key, value, ttlMs);
  return value;
}

export async function invalidateCachedEverywhere(key: string): Promise<void> {
  invalidateCached(key);
  await invalidateCachedDb(key);
}
