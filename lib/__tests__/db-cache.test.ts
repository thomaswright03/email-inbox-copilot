import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSql = vi.fn();
vi.mock("@neondatabase/serverless", () => ({
  neon: () => mockSql,
}));

describe("db-cache", () => {
  const originalEnv = process.env.DATABASE_URL;

  beforeEach(() => {
    vi.resetModules();
    mockSql.mockReset();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  it("no-ops on read/write/invalidate when DATABASE_URL isn't set", async () => {
    delete process.env.DATABASE_URL;
    const { getCachedDb, setCachedDb, invalidateCachedDb } = await import("../db-cache");

    expect(await getCachedDb("k")).toBeUndefined();
    await expect(setCachedDb("k", { a: 1 }, 1000)).resolves.toBeUndefined();
    await expect(invalidateCachedDb("k")).resolves.toBeUndefined();
    expect(mockSql).not.toHaveBeenCalled();
  });

  it("returns undefined on a cache miss (no matching row)", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockSql.mockResolvedValue([]); // schema-create + select both resolve to []
    const { getCachedDb } = await import("../db-cache");

    expect(await getCachedDb("missing-key")).toBeUndefined();
  });

  it("returns the cached value on a hit", async () => {
    process.env.DATABASE_URL = "postgres://test";
    const { seal } = await import("../crypto");
    const stored = seal({ hello: "world" }, "response-cache", "present-key");
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("SELECT value")) {
        return Promise.resolve([{ value: stored }]);
      }
      return Promise.resolve([]);
    });
    const { getCachedDb } = await import("../db-cache");

    expect(await getCachedDb("present-key")).toEqual({ hello: "world" });
  });

  it("writes only ciphertext, never the inbox data itself", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockSql.mockResolvedValue([]);
    const { setCachedDb } = await import("../db-cache");

    await setCachedDb("today:gid:2026-09-24", { subject: "Your bank statement" }, 1000);

    const insert = mockSql.mock.calls.find(([strings]) => (strings as TemplateStringsArray).join("").includes("INSERT"));
    expect(insert).toBeDefined();
    const written = JSON.stringify(insert!.slice(1));
    expect(written).not.toContain("bank statement");
    expect(written).toContain("ct");
  });

  it("treats a row sealed under a different key as a miss (no cross-user replay)", async () => {
    process.env.DATABASE_URL = "postgres://test";
    const { seal } = await import("../crypto");
    const stored = seal({ hello: "world" }, "response-cache", "today:user-a:2026-09-24");
    mockSql.mockImplementation((strings: TemplateStringsArray) =>
      Promise.resolve(strings.join("").includes("SELECT value") ? [{ value: stored }] : [])
    );
    const { getCachedDb } = await import("../db-cache");

    expect(await getCachedDb("today:user-b:2026-09-24")).toBeUndefined();
  });

  it("treats a legacy plaintext row as a miss", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockSql.mockImplementation((strings: TemplateStringsArray) =>
      Promise.resolve(strings.join("").includes("SELECT value") ? [{ value: { hello: "world" } }] : [])
    );
    const { getCachedDb } = await import("../db-cache");

    expect(await getCachedDb("k")).toBeUndefined();
  });

  it("fails open (returns undefined) if the query throws", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockSql.mockRejectedValue(new Error("connection refused"));
    const { getCachedDb } = await import("../db-cache");

    expect(await getCachedDb("k")).toBeUndefined();
  });

  it("setCachedDb and invalidateCachedDb fail open without throwing", async () => {
    process.env.DATABASE_URL = "postgres://test";
    mockSql.mockRejectedValue(new Error("connection refused"));
    const { setCachedDb, invalidateCachedDb } = await import("../db-cache");

    await expect(setCachedDb("k", "v", 1000)).resolves.toBeUndefined();
    await expect(invalidateCachedDb("k")).resolves.toBeUndefined();
  });
});
