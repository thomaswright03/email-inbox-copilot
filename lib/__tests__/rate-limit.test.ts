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

describe("AI spend budget in production", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("fails closed when there is no shared counter", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { enforceAiBudget } = await import("../rate-limit");
    await expect(enforceAiBudget("user-x")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("still counts in memory outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "");
    const { enforceAiBudget } = await import("../rate-limit");
    await expect(enforceAiBudget("user-y")).resolves.toBeUndefined();
  });
});
