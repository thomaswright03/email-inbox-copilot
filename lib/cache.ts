// Best-effort, per-instance in-memory cache. This is NOT durable or shared
// across serverless cold starts/instances — a real multi-instance guarantee
// would need Redis/Vercel KV. For this app's scale (one user re-visiting the
// same tab a few times within a warm instance), it's still a real reduction
// in redundant Gmail/Gemini calls against the free-tier daily quota, and it
// fails open: a cache miss just re-fetches, it never breaks anything.
type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCached(key: string): void {
  store.delete(key);
}
