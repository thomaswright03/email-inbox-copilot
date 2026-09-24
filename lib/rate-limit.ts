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
  // and the whole deployment, can spend in a day. Sizing (docs/deployment.md
  // "AI budget"): a dashboard load makes at most one call (the triage, which
  // sorts the briefing and checks spam together), and only when new mail
  // arrived or the cached triage expired; a heavy user makes about 60 such
  // loads a day, plus one per summary language; the per-user default leaves
  // room for four times that.
  // The deployment-wide default covers 20 such users with headroom. The
  // window is the UTC day (resets at 00:00 UTC).
  aiPerUser: { name: "ai-user", limit: envInt("AI_CALLS_PER_USER_PER_DAY", 250), windowMs: DAY, requireShared: true },
  aiGlobal: { name: "ai-global", limit: envInt("AI_CALLS_GLOBAL_PER_DAY", 3000), windowMs: DAY, requireShared: true },
} satisfies Record<string, RateLimitRule>;

// In production a requireShared rule is only counted in Postgres. The one
// exception is a Gemini stand-in (GEMINI_API_ROOT_URL, end-to-end tests
// only, flagged at startup in production): no real Gemini spend can happen,
// so the budget may be counted in memory.
function requiresSharedCounter(rule: RateLimitRule): boolean {
  return rule.requireShared === true && process.env.NODE_ENV === "production" && !process.env.GEMINI_API_ROOT_URL;
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

const MAX_MEMORY_BUCKETS = 10_000;
const memory = new Map<string, { windowStart: number; count: number }>();

function hitMemory(bucket: string, windowStart: number, cost: number): number {
  const entry = memory.get(bucket);
  // Giving calls back to a window that has already been replaced: nothing to do.
  if (cost < 0 && entry?.windowStart !== windowStart) return 0;
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

  const sharedOnly = requiresSharedCounter(rule);
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

// When the current fixed window of `rule` ends.
function windowResetsAt(rule: RateLimitRule, now = Date.now()): Date {
  return new Date(now - (now % rule.windowMs) + rule.windowMs);
}

// Adds `delta` (negative to give calls back) to one counter of the current
// window and returns the new count, or null when the shared counter is
// required but can't be reached.
async function adjustCounter(rule: RateLimitRule, subject: string, delta: number, windowStart: number): Promise<number | null> {
  const bucket = `${rule.name}:${subject}`;
  const sharedOnly = requiresSharedCounter(rule);
  const sql = getSql();
  if (sql) {
    try {
      return await hitDb(sql, bucket, windowStart, delta);
    } catch (err) {
      logError("rate-limit.db", err);
      if (sharedOnly) return null;
    }
  } else if (sharedOnly) {
    return null;
  }
  return hitMemory(bucket, windowStart, delta);
}

// Takes up to `wanted` calls from `rule`'s budget and returns how many were
// granted; anything over the limit is given straight back, so a refused
// request doesn't use up budget.
async function takeUpTo(rule: RateLimitRule, subject: string, wanted: number, windowStart: number): Promise<number | null> {
  const count = await adjustCounter(rule, subject, wanted, windowStart);
  if (count === null) return null;
  const over = Math.max(0, count - rule.limit);
  const granted = Math.max(0, wanted - over);
  if (granted < wanted) {
    await adjustCounter(rule, subject, -(wanted - granted), windowStart);
    // Reported once per window: when this request is the one that runs out.
    if (count - wanted < rule.limit) {
      logSecurityEvent("ai_budget_exhausted", { rule: rule.name, subject: subject === "global" ? "global" : "user" });
    }
  }
  return granted;
}

// A grant of Gemini calls from the daily AI budgets. `release` gives back
// calls that were granted but not made, so the budget only counts calls
// actually sent to Gemini.
export type AiBudgetGrant = {
  granted: number;
  // "budget": a daily AI budget is used up until `resetsAt`.
  // "unavailable": the shared budget counter couldn't be reached, so no
  // calls are allowed (fails closed in production).
  limitedBy: "budget" | "unavailable" | null;
  resetsAt: string;
  release: (unused: number) => Promise<void>;
};

// Asks for up to `wanted` Gemini calls on behalf of a user: both the
// per-user and the deployment-wide daily budget must have room.
export async function reserveAiCalls(userId: string, wanted: number): Promise<AiBudgetGrant> {
  const now = Date.now();
  const user = RATE_LIMITS.aiPerUser;
  const global = RATE_LIMITS.aiGlobal;
  const windowStart = now - (now % user.windowMs);
  const resetsAt = windowResetsAt(user, now).toISOString();
  const none = (limitedBy: AiBudgetGrant["limitedBy"]): AiBudgetGrant => ({
    granted: 0,
    limitedBy,
    resetsAt,
    release: async () => {},
  });
  if (wanted <= 0) return none(null);

  const fromUser = await takeUpTo(user, userId, wanted, windowStart);
  if (fromUser === null) {
    logSecurityEvent("ai_budget_unavailable", { rule: user.name });
    return none("unavailable");
  }
  if (fromUser === 0) return none("budget");

  const fromGlobal = await takeUpTo(global, "global", fromUser, windowStart);
  if (fromGlobal === null || fromGlobal < fromUser) {
    await adjustCounter(user, userId, -(fromUser - (fromGlobal ?? 0)), windowStart);
  }
  if (fromGlobal === null) {
    logSecurityEvent("ai_budget_unavailable", { rule: global.name });
    return none("unavailable");
  }
  if (fromGlobal === 0) return none("budget");

  const granted = fromGlobal;
  let outstanding = granted;
  return {
    granted,
    limitedBy: granted < wanted ? "budget" : null,
    resetsAt,
    release: async (unused: number) => {
      const back = Math.min(Math.max(0, Math.floor(unused)), outstanding);
      if (back === 0) return;
      outstanding -= back;
      await adjustCounter(user, userId, -back, windowStart);
      await adjustCounter(global, "global", -back, windowStart);
    },
  };
}
