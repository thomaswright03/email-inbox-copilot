import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { userCacheKey } from "../response-cache";
import { verdictCacheKey } from "../verdict-cache";
import { localDay } from "../local-day";
import { USER_KEY_KINDS, userCacheKeyPatterns } from "../user-key-kinds.mjs";

// scripts/user-data.mjs (the operator's export / delete tool for Privacy
// Policy section 6 requests) run against an in-memory response_cache, so we
// can see which of a user's cache rows it finds and removes.

// SQL LIKE with backslash escapes, as Postgres applies it.
function like(value: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    else if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "s").test(value);
}

let cacheRows: { key: string; expires_at: string }[] = [];

function run(text: string, params: unknown[]) {
  if (!text.includes("response_cache")) return { rows: [], rowCount: 0 };
  const [patterns] = params as [string[]];
  expect(Array.isArray(patterns)).toBe(true);
  const matches = cacheRows.filter((row) => patterns.some((p) => like(row.key, p)));
  if (text.startsWith("DELETE")) cacheRows = cacheRows.filter((row) => !matches.includes(row));
  return { rows: matches.map((row) => ({ ...row })), rowCount: matches.length };
}

vi.mock("@neondatabase/serverless", () => ({
  neon: () => ({
    query: (text: string, params: unknown[]) => ({
      text,
      params,
      then: (resolve: (rows: unknown) => unknown, reject: (err: unknown) => unknown) =>
        Promise.resolve()
          .then(() => run(text, params).rows)
          .then(resolve, reject),
    }),
    transaction: async (queries: { text: string; params: unknown[] }[]) => queries.map((q) => run(q.text, q.params)),
  }),
}));

async function runScript(command: "export" | "delete", googleId: string): Promise<string> {
  const logs: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((line: string) => void logs.push(line));
  const argv = process.argv;
  process.argv = [argv[0], "user-data.mjs", command, googleId];
  try {
    vi.resetModules();
    await import("../../scripts/user-data.mjs");
  } finally {
    process.argv = argv;
    log.mockRestore();
  }
  return logs.join("\n");
}

const USER = "1234_5";
const OTHER = "123445";
const day = localDay("America/Los_Angeles", new Date("2026-09-24T18:00:00Z"));

// One row of every kind the app writes, for the user and for someone else
// whose id would match an unescaped LIKE "_".
function seed(userId: string) {
  return [
    userCacheKey("messages", userId, day),
    userCacheKey("today", userId, day, "en"),
    userCacheKey("spam", userId, day),
    userCacheKey("triage", userId, day, "en"),
    verdictCacheKey(userId, "gemini-3.5-flash-lite"),
  ].map((key) => ({ key, expires_at: "2026-09-24T18:05:00Z" }));
}

describe("scripts/user-data.mjs response_cache coverage", () => {
  beforeEach(() => {
    vi.stubEnv("MIGRATION_DATABASE_URL", "postgres://owner@localhost/test");
    cacheRows = [...seed(USER), ...seed(OTHER)];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("covers every per-user cache kind, including the briefing's triage rows", () => {
    expect(USER_KEY_KINDS).toContain("triage");
    const kinds = new Set(seed(USER).map((row) => row.key.split(":")[0]));
    // Every kind the app writes is in the shared list, and vice versa.
    expect([...kinds].sort()).toEqual([...USER_KEY_KINDS].sort());
    for (const row of seed(USER)) expect(userCacheKeyPatterns(USER).some((p) => like(row.key, p))).toBe(true);
    for (const row of seed(OTHER)) expect(userCacheKeyPatterns(USER).some((p) => like(row.key, p))).toBe(false);
  });

  it("exports every cache row of the user, triage included, and none of anyone else's", async () => {
    const report = JSON.parse(await runScript("export", USER));
    const keys = report.cachedInboxData.map((row: { key: string }) => row.key).sort();
    expect(keys).toEqual(seed(USER).map((row) => row.key).sort());
    expect(keys).toContain(userCacheKey("triage", USER, day, "en"));
  });

  it("deletes every cache row of the user, triage included, and leaves anyone else's", async () => {
    const out = await runScript("delete", USER);
    expect(out).toContain(`response_cache ${seed(USER).length}`);
    expect(cacheRows.map((row) => row.key).sort()).toEqual(seed(OTHER).map((row) => row.key).sort());
  });
});
