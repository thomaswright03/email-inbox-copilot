import { getSql } from "./db";
import { logError, logSecurityEvent } from "./log";

// Fixed-window rate limiting. With DATABASE_URL set the counters live in
// Postgres, so limits hold across serverless instances and cold starts;
// without it (or if the database errors) each instance falls back to its own
// in-memory counters, which still bounds a single instance.

// requireShared: in production the rule is only enforced from the shared
// Postgres counter; if that can't be reached the request is refused rather
// than counted per instance (used for the Gemini spend budgets, where a
// per-instance count would multiply the cap by the number of instances).
export type RateLimitRule = { name: string; limit: number; windowMs: number; requireShared?: boolean };

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
  aiPerUser: { name: "ai-user", limit: envInt("AI_CALLS_PER_USER_PER_DAY", 60), windowMs: DAY, requireShared: true },
  aiGlobal: { name: "ai-global", limit: envInt("AI_CALLS_GLOBAL_PER_DAY", 400), windowMs: DAY, requireShared: true },
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

const MAX_MEMORY_BUCKETS = 10_000;
const memory = new Map<string, { windowStart: number; count: number }>();

function hitMemory(bucket: string, windowStart: number, cost: number): number {
  const entry = memory.get(bucket);
  if (entry && entry.windowStart === windowStart) {
    entry.count += cost;
    return entry.count;
  }
  if (!entry && memory.size >= MAX_MEMORY_BUCKETS) {
    for (const [k, v] of memory) if (v.windowStart < windowStart) memory.delete(k);
    if (memory.size >= MAX_MEMORY_BUCKETS) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
  }
  memory.set(bucket, { windowStart, count: cost });
  return cost;
}


async function hitDb(
  sql: NonNullable<ReturnType<typeof getSql>>,
  bucket: string,
  windowStart: number,
  cost: number
): Promise<number> {
  const rows = await sql`
    INSERT INTO rate_limit (bucket, window_start, count)
    VALUES (${bucket}, ${new Date(windowStart).toISOString()}, ${cost})
    ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limit.count + ${cost}
    RETURNING count
  `;
  if (Math.random() < 0.01) {
    await sql`DELETE FROM rate_limit WHERE window_start < now() - interval '2 days'`;
  }
  return Number((rows[0] as { count: number }).count);
}

export async function consumeRateLimit(rule: RateLimitRule, subject: string, cost = 1): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = now - (now % rule.windowMs);
  const bucket = `${rule.name}:${subject}`;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));

  const sharedOnly = rule.requireShared === true && process.env.NODE_ENV === "production";
  const refuse = (): RateLimitResult => {
    logSecurityEvent("ai_budget_unavailable", { rule: rule.name });
    return { allowed: false, retryAfterSeconds: 60 };
  };

  let count: number;
  const sql = getSql();
  if (sql) {
    try {
      count = await hitDb(sql, bucket, windowStart, cost);
    } catch (err) {
      logError("rate-limit.db", err);
      if (sharedOnly) return refuse();
      count = hitMemory(bucket, windowStart, cost);
    }
  } else {
    if (sharedOnly) return refuse();
    count = hitMemory(bucket, windowStart, cost);
  }

  const allowed = count <= rule.limit;
  if (!allowed && count - cost < rule.limit + 1) {
    // Reported once per window, when the limit is first crossed.
    logSecurityEvent("rate_limited", { rule: rule.name, subject: subject === "global" ? "global" : "user" });
  }
  return { allowed, retryAfterSeconds };
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super("Too many requests");
  }
}

export async function enforceRateLimit(rule: RateLimitRule, subject: string, cost = 1): Promise<void> {
  const result = await consumeRateLimit(rule, subject, cost);
  if (!result.allowed) throw new RateLimitError(result.retryAfterSeconds);
}

// Spend guard before `calls` Gemini calls on behalf of a user: both the
// per-user and the deployment-wide daily budget must have room.
export async function enforceAiBudget(userId: string, calls = 1): Promise<void> {
  if (calls <= 0) return;
  await enforceRateLimit(RATE_LIMITS.aiPerUser, userId, calls);
  await enforceRateLimit(RATE_LIMITS.aiGlobal, "global", calls);
}
