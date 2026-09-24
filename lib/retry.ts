import { toSafeError } from "./log";

// Bounded retry with exponential backoff for idempotent reads (Gmail
// list/get, Gemini generation). Mutations (trash, archive, unsubscribe) are
// never passed through here: repeating them could act twice.

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_SOCKET"]);

export function isTransientError(err: unknown): boolean {
  const safe = toSafeError(err);
  if (safe.status !== undefined) return TRANSIENT_STATUS.has(safe.status);
  if (safe.code && TRANSIENT_CODES.has(safe.code)) return true;
  return /timed? ?out|socket hang up|network|fetch failed/i.test(safe.message);
}

// Retry-After in seconds or as an HTTP date, from a gaxios-style error.
export function retryAfterMs(err: unknown, now = Date.now()): number | null {
  const headers = (err as { response?: { headers?: unknown } })?.response?.headers;
  let value: string | null | undefined;
  if (headers && typeof (headers as Headers).get === "function") value = (headers as Headers).get("retry-after");
  else if (headers && typeof headers === "object") value = (headers as Record<string, string | undefined>)["retry-after"];
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  // The whole call, waits included, must finish within this budget; a
  // retry that would wait past it is not attempted.
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 300, budgetMs = 8000, sleep = defaultSleep } = options;
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isTransientError(err)) throw err;
      const backoff = baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5);
      const wait = Math.max(backoff, retryAfterMs(err) ?? 0);
      if (Date.now() - started + wait > budgetMs) throw err;
      await sleep(wait);
    }
  }
}
