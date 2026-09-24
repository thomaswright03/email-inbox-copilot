import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSql = vi.fn();
vi.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));

describe("session-store", () => {
  const original = process.env.DATABASE_URL;
  beforeEach(() => {
    vi.resetModules();
    mockSql.mockReset();
    process.env.DATABASE_URL = "postgres://test";
  });
  afterEach(() => {
    process.env.DATABASE_URL = original;
  });

  it("accepts a cookie carrying the current version", async () => {
    mockSql.mockResolvedValue([{ version: 3 }]);
    const { checkSessionVersion } = await import("../session-store");
    expect(await checkSessionVersion("g1", 3)).toBe("valid");
  });

  it("rejects a cookie issued before a revocation", async () => {
    mockSql.mockResolvedValue([{ version: 4 }]);
    const { checkSessionVersion } = await import("../session-store");
    expect(await checkSessionVersion("g1", 3)).toBe("revoked");
  });

  it("rejects a cookie with no recorded version", async () => {
    mockSql.mockResolvedValue([{ version: 1 }]);
    const { checkSessionVersion } = await import("../session-store");
    expect(await checkSessionVersion("g1", undefined)).toBe("revoked");
  });

  it("fails closed when the store can't be read", async () => {
    mockSql.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { checkSessionVersion } = await import("../session-store");
    expect(await checkSessionVersion("g1", 1)).toBe("unavailable");
  });

  it("revokeUserSessions bumps the version", async () => {
    mockSql.mockResolvedValue([]);
    const { revokeUserSessions } = await import("../session-store");
    await revokeUserSessions("g1");
    const text = (mockSql.mock.calls[0][0] as TemplateStringsArray).join("?");
    expect(text).toContain("version = user_sessions.version + 1");
  });
});

describe("no DDL on the request path", () => {
  it("no runtime module creates, alters or drops tables", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const files = readdirSync("lib").filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      expect(readFileSync(`lib/${f}`, "utf8")).not.toMatch(/\b(CREATE|ALTER|DROP)\s+TABLE\b/i);
    }
  });
});
