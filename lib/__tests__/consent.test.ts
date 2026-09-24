import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSql = vi.fn();
vi.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));

describe("recordConsent", () => {
  const original = process.env.DATABASE_URL;
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mockSql.mockReset();
    process.env.DATABASE_URL = "postgres://test";
  });
  afterEach(() => {
    process.env.DATABASE_URL = original;
  });

  it("stores the Google account id and the accepted version", async () => {
    mockSql.mockResolvedValue([]);
    const { recordConsent } = await import("../consent");
    expect(await recordConsent("g1", "2026-09-24.1")).toBe(true);
    const [strings, ...values] = mockSql.mock.calls[0];
    expect(strings.join("?")).toContain("INSERT INTO consent_records");
    expect(values).toEqual(["g1", "2026-09-24.1"]);
  });

  it("reports failure when the record can't be written, so the acceptance isn't applied", async () => {
    mockSql.mockRejectedValue(new Error("db down"));
    const { recordConsent } = await import("../consent");
    expect(await recordConsent("g1", "2026-09-24.1")).toBe(false);
  });

  it("refuses in production when there is no database to record it in", async () => {
    delete process.env.DATABASE_URL;
    vi.stubEnv("NODE_ENV", "production");
    const { recordConsent } = await import("../consent");
    expect(await recordConsent("g1", "2026-09-24.1")).toBe(false);
  });
});
