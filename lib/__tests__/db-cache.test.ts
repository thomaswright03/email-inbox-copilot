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
    mockSql.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("SELECT value")) {
        return Promise.resolve([{ value: { hello: "world" } }]);
      }
      return Promise.resolve([]);
    });
    const { getCachedDb } = await import("../db-cache");

    expect(await getCachedDb("present-key")).toEqual({ hello: "world" });
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
