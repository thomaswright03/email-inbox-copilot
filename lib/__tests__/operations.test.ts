import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Operator-facing pieces: the production configuration check, the health
// endpoint, the startup hook, the audit log and the Not-spam store's
// database path.
const mockSql = vi.fn();
vi.mock("@neondatabase/serverless", () => ({ neon: () => mockSql }));
vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));

import { productionConfigProblems } from "../config-check";
import { getGoogleSession } from "@/lib/session";

const GOOD_ENV = {
  AUTH_SECRET: "x".repeat(32),
  AUTH_GOOGLE_ID: "id",
  AUTH_GOOGLE_SECRET: "secret",
  DATABASE_URL: "postgres://app@db/inbox",
  ALLOWED_EMAILS: "a@example.com",
} as unknown as NodeJS.ProcessEnv;

describe("productionConfigProblems", () => {
  it("is empty for a complete production configuration", () => {
    expect(productionConfigProblems(GOOD_ENV)).toEqual([]);
  });

  it("names every missing or dangerous setting", () => {
    const problems = productionConfigProblems({
      AUTH_SECRET: "short",
      GMAIL_API_ROOT_URL: "http://127.0.0.1:1/",
      MIGRATION_DATABASE_URL: "postgres://owner@db/inbox",
    } as unknown as NodeJS.ProcessEnv);
    expect(problems.join("\n")).toMatch(/AUTH_SECRET/);
    expect(problems.join("\n")).toMatch(/AUTH_GOOGLE_ID/);
    expect(problems.join("\n")).toMatch(/DATABASE_URL is required/);
    expect(problems.join("\n")).toMatch(/ALLOWED_EMAILS/);
    expect(problems.join("\n")).toMatch(/GMAIL_API_ROOT_URL/);
    expect(problems.join("\n")).toMatch(/MIGRATION_DATABASE_URL/);
  });
});

describe("startup check (instrumentation.ts)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("raises an alert when a production server starts without DATABASE_URL", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    const { register } = await import("@/instrumentation");
    await register();
    const lines = error.mock.calls.map(([line]) => String(line));
    expect(lines.some((l) => l.includes('"kind":"config_invalid"') && l.includes("DATABASE_URL is required"))).toBe(true);
    error.mockRestore();
  });

  it("stays quiet outside production", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    const { register } = await import("@/instrumentation");
    await register();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("GET /api/health", () => {
  beforeEach(() => {
    mockSql.mockReset();
    vi.mocked(getGoogleSession).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("requires sign-in", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);
    const { GET } = await import("@/app/api/health/route");
    expect((await GET(new Request("http://localhost/api/health"))).status).toBe(401);
  });

  it("reports whether the database is reachable and the production configuration is complete", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue({ userId: "g", userEmail: "a@example.com", userName: null, accessToken: "t", consented: true });
    vi.stubEnv("DATABASE_URL", "postgres://app@db/inbox");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOWED_EMAILS", "");
    mockSql.mockResolvedValue([{ "?column?": 1 }]);
    const { GET } = await import("@/app/api/health/route");
    expect(await (await GET(new Request("http://localhost/api/health"))).json()).toEqual({
      auditLog: { configured: true, reachable: true },
      configOk: false,
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    mockSql.mockRejectedValue(new Error("db down"));
    expect((await (await GET(new Request("http://localhost/api/health"))).json()).auditLog).toEqual({
      configured: true,
      reachable: false,
    });
  });
});

describe("audit log", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("writes one row per event and a log line, without email content", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://app@db/inbox");
    mockSql.mockResolvedValue([]);
    const { logAuditEvent } = await import("../audit");
    await logAuditEvent({ userId: "g1", action: "delete", messageId: "m1" });
    expect(mockSql).toHaveBeenCalled();
    const [strings, ...values] = mockSql.mock.calls[0];
    expect((strings as string[]).join("?")).toContain("INSERT INTO audit_log");
    expect(values).toEqual(["g1", "delete", "m1", null]);
    expect(String(info.mock.calls[0][0])).toContain('"level":"audit"');
    info.mockRestore();
  });

  it("never blocks the action when the database write fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://app@db/inbox");
    mockSql.mockRejectedValue(new Error("db down"));
    const { logAuditEvent } = await import("../audit");
    await expect(logAuditEvent({ userId: "g1", action: "ignore" })).resolves.toBeUndefined();
    expect(String(error.mock.calls[0][0])).toContain("audit.write");
  });

  it("reports an unconfigured audit log", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { getAuditLogStatus } = await import("../audit");
    expect(await getAuditLogStatus()).toEqual({ configured: false, reachable: false });
  });
});

describe("Not spam store (database)", () => {
  beforeEach(() => {
    mockSql.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("stores, reads and forgets a user's Not spam choices", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://app@db/inbox");
    mockSql.mockResolvedValue([{ message_id: "m1" }, { message_id: "m2" }]);
    const { markIgnored, unmarkIgnored, ignoredMessageIds } = await import("../ignored");
    await markIgnored("g1", "m1");
    expect((mockSql.mock.calls[0][0] as string[]).join("?")).toContain("INSERT INTO ignored_messages");
    expect(await ignoredMessageIds("g1")).toEqual(new Set(["m1", "m2"]));
    await unmarkIgnored("g1", "m1");
    expect((mockSql.mock.calls.at(-1)![0] as string[]).join("?")).toContain("DELETE FROM ignored_messages");
  });

  it("a failed read leaves nothing out rather than failing the spam list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("DATABASE_URL", "postgres://app@db/inbox");
    mockSql.mockRejectedValue(new Error("db down"));
    const { ignoredMessageIds } = await import("../ignored");
    expect(await ignoredMessageIds("g1")).toEqual(new Set());
  });

  it("without a database, remembers choices in memory", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { markIgnored, unmarkIgnored, ignoredMessageIds } = await import("../ignored");
    await markIgnored("mem-user", "m9");
    expect(await ignoredMessageIds("mem-user")).toEqual(new Set(["m9"]));
    await unmarkIgnored("mem-user", "m9");
    expect(await ignoredMessageIds("mem-user")).toEqual(new Set());
  });
});
