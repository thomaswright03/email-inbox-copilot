import { describe, it, expect, vi, afterEach } from "vitest";
import { cachedVerdicts, rememberVerdicts, VERDICT_TTL_MS, verdictCacheKey } from "../verdict-cache";
import { purgeUserCaches } from "../response-cache";

describe("spam verdict cache (no DATABASE_URL: memory only)", () => {
  afterEach(() => vi.useRealTimers());

  it("remembers each message's verdict per user and model", async () => {
    await rememberVerdicts("u1", "model-a", [
      { id: "m1", isSpam: true, reason: "marketing" },
      { id: "m2", isSpam: false, reason: "legitimate" },
    ]);
    await rememberVerdicts("u1", "model-a", [{ id: "m3", isSpam: true, reason: "newsletter" }]);
    const verdicts = await cachedVerdicts("u1", "model-a");
    expect([...verdicts.keys()].sort()).toEqual(["m1", "m2", "m3"]);
    expect(verdicts.get("m1")).toEqual({ isSpam: true, reason: "marketing" });
    expect((await cachedVerdicts("u2", "model-a")).size).toBe(0);
    expect((await cachedVerdicts("u1", "model-b")).size).toBe(0);
    await rememberVerdicts("u1", "model-a", []);
  });

  it("forgets verdicts after a little more than a day, and at sign-out", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    await rememberVerdicts("u3", "model-a", [{ id: "old", isSpam: true, reason: "marketing" }]);
    vi.setSystemTime(Date.now() + VERDICT_TTL_MS - 1000);
    await rememberVerdicts("u3", "model-a", [{ id: "new", isSpam: true, reason: "marketing" }]);
    vi.setSystemTime(Date.now() + 2000);
    expect([...(await cachedVerdicts("u3", "model-a")).keys()]).toEqual(["new"]);

    await purgeUserCaches("u3");
    expect((await cachedVerdicts("u3", "model-a")).size).toBe(0);
  });

  it("refuses to build a key without a user id", () => {
    expect(() => verdictCacheKey("", "m")).toThrow();
  });
});
