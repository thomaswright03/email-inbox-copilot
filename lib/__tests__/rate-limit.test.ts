import { describe, it, expect, vi, afterEach } from "vitest";
import { consumeRateLimit, enforceRateLimit, RateLimitError } from "../rate-limit";

describe("rate limiting (in-memory fallback, no DATABASE_URL)", () => {
  it("allows up to the limit in a window, then refuses with a Retry-After", async () => {
    const rule = { name: "t1", limit: 3, windowMs: 60_000 };
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(rule, "user-1"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each subject separately", async () => {
    const rule = { name: "t2", limit: 1, windowMs: 60_000 };
    expect((await consumeRateLimit(rule, "a")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "b")).allowed).toBe(true);
    expect((await consumeRateLimit(rule, "a")).allowed).toBe(false);
  });

  it("enforceRateLimit throws RateLimitError once exhausted", async () => {
    const rule = { name: "t3", limit: 1, windowMs: 60_000 };
    await enforceRateLimit(rule, "u");
    await expect(enforceRateLimit(rule, "u")).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("AI spend budget", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("fails closed in production when there is no shared counter", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reserveAiCalls } = await import("../rate-limit");
    expect(await reserveAiCalls("user-x", 1)).toMatchObject({ granted: 0, limitedBy: "unavailable" });
  });

  it("grants what is left, gives the rest back, and says when it resets (UTC midnight)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_CALLS_PER_USER_PER_DAY", "5");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reserveAiCalls } = await import("../rate-limit");

    const first = await reserveAiCalls("user-y", 3);
    expect(first).toMatchObject({ granted: 3, limitedBy: null });
    const second = await reserveAiCalls("user-y", 4);
    expect(second).toMatchObject({ granted: 2, limitedBy: "budget" });
    expect(await reserveAiCalls("user-y", 1)).toMatchObject({ granted: 0, limitedBy: "budget" });

    // Calls that were granted but never made go back into the budget, once.
    await second.release(2);
    await second.release(2);
    expect(await reserveAiCalls("user-y", 5)).toMatchObject({ granted: 2 });

    const now = new Date();
    expect(first.resetsAt).toBe(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString());
    expect(await reserveAiCalls("user-y", 0)).toMatchObject({ granted: 0, limitedBy: null });
  });

  it("the deployment-wide budget caps every user together", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("AI_CALLS_GLOBAL_PER_DAY", "4");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { reserveAiCalls } = await import("../rate-limit");
    expect(await reserveAiCalls("user-a", 3)).toMatchObject({ granted: 3 });
    expect(await reserveAiCalls("user-b", 3)).toMatchObject({ granted: 1, limitedBy: "budget" });
    expect(await reserveAiCalls("user-c", 1)).toMatchObject({ granted: 0, limitedBy: "budget" });
  });

  it("defaults leave room for a day of real use", async () => {
    vi.stubEnv("AI_CALLS_PER_USER_PER_DAY", "");
    vi.stubEnv("AI_CALLS_GLOBAL_PER_DAY", "");
    const { RATE_LIMITS } = await import("../rate-limit");
    expect(RATE_LIMITS.aiPerUser.limit).toBeGreaterThanOrEqual(200);
    expect(RATE_LIMITS.aiGlobal.limit).toBeGreaterThanOrEqual(RATE_LIMITS.aiPerUser.limit * 10);
  });
});
