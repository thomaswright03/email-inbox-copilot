import { getSql } from "./db";
import type { Sql } from "./db";
import { logError, logSecurityEvent } from "./log";

// Fixed-window rate limiting. With DATABASE_URL set the counters live in
// Postgres, so limits hold across serverless instances and cold starts;
// without it (or if the database errors) each instance falls back to its own
// in-memory counters, which still bounds a single instance.

export type RateLimitRule = { name: string; limit: number; windowMs: number };

function envInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export const RATE_LIMITS = {
  // Each inbox read is ~51 Gmail API calls.
  inboxReads: { name: "inbox-reads", limit: envInt("RATE_LIMIT_INBOX_READS_PER_MINUTE", 20), windowMs: MINUTE },
  actions: { name: "actions", limit: envInt("RATE_LIMIT_ACTIONS_PER_MINUTE", 30), windowMs: MINUTE },
  // Gemini calls are only made on a cache miss; these cap what one account,
  // and the whole deployment, can spend in a day.
  aiPerUser: { name: "ai-user", limit: envInt("AI_CALLS_PER_USER_PER_DAY", 40), windowMs: DAY },
  aiGlobal: { name: "ai-global", limit: envInt("AI_CALLS_GLOBAL_PER_DAY", 400), windowMs: DAY },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

const MAX_MEMORY_BUCKETS = 10_000;
const memory = new Map<string, { windowStart: number; count: number }>();

function hitMemory(bucket: string, windowStart: number): number {
  const entry = memory.get(bucket);
  if (entry && entry.windowStart === windowStart) {
    entry.count += 1;
    return entry.count;
  }
  if (!entry && memory.size >= MAX_MEMORY_BUCKETS) {
    for (const [k, v] of memory) if (v.windowStart < windowStart) memory.delete(k);
    if (memory.size >= MAX_MEMORY_BUCKETS) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
  }
  memory.set(bucket, { windowStart, count: 1 });
  return 1;
}

let schemaReady: Promise<void> | null = null;

async function ensureSchema(sql: Sql): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS rate_limit (
        bucket TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (bucket, window_start)
      )
    `.then(() => undefined);
    schemaReady.catch(() => {
      schemaReady = null;
    });
  }
  await schemaReady;
}

async function hitDb(sql: Sql, bucket: string, windowStart: number): Promise<number> {
  await ensureSchema(sql);
  const rows = await sql`
    INSERT INTO rate_limit (bucket, window_start, count)
    VALUES (${bucket}, ${new Date(windowStart).toISOString()}, 1)
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limit.count + 1
    RETURNING count
  `;
  if (Math.random() < 0.01) {
    await sql`DELETE FROM rate_limit WHERE window_start < now() - interval '2 days'`;
  }
  return Number((rows[0] as { count: number }).count);
}

export async function consumeRateLimit(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - (now % rule.windowMs);
  const bucket = `${rule.name}:${subject}`;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));

  let count: number;
  const sql = getSql();
  if (sql) {
    try {
      count = await hitDb(sql, bucket, windowStart);
    } catch (err) {
      logError("rate-limit.db", err);
      count = hitMemory(bucket, windowStart);
    }
  } else {
    count = hitMemory(bucket, windowStart);
  }

  const allowed = count <= rule.limit;
  if (!allowed && count === rule.limit + 1) {
    // Logged once per window, when the limit is first crossed.
    logSecurityEvent("rate_limited", { rule: rule.name, subject: subject === "global" ? "global" : "user" });
  }
  return { allowed, retryAfterSeconds };
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests");
  }
}

export async function enforceRateLimit(rule: RateLimitRule, subject: string): Promise<void> {
  const result = await consumeRateLimit(rule, subject);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

// Spend guard for one Gemini call on behalf of a user: both the per-user and
// the deployment-wide daily budget must have room.
export async function enforceAiBudget(userId: string): Promise<void> {
  await enforceRateLimit(RATE_LIMITS.aiPerUser, userId);
  await enforceRateLimit(RATE_LIMITS.aiGlobal, "global");
}
