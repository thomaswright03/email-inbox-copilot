import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/gmail", () => ({ fetchTodaysMessages: vi.fn() }));
vi.mock("@/lib/ai", () => ({ summarizeToday: vi.fn() }));

import { auth } from "@/auth";
import { fetchTodaysMessages } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";
import { GET } from "./route";

// These exercise the actual route handler end to end — auth, Gmail, and
// Gemini are the true external boundaries (mocked); everything in between
// (caching, error shaping, response assembly) is the real code, catching
// exactly the "pieces don't wire together correctly" class of regression
// unit tests of individual functions can't.
describe("GET /api/emails/today", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns the summary, count, and mapped emails on success", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "int-test-1@example.com" } } as never);
    vi.mocked(fetchTodaysMessages).mockResolvedValue([
      {
        id: "m1",
        threadId: "t1",
        from: "sender@example.com",
        subject: "Hi",
        snippet: "snip",
        date: "2026-09-23",
        listUnsubscribe: null,
        isInInbox: true,
      },
    ]);
    vi.mocked(summarizeToday).mockResolvedValue("**Summary**");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toBe("**Summary**");
    expect(body.count).toBe(1);
    expect(body.emails).toEqual([
      { id: "m1", from: "sender@example.com", subject: "Hi", snippet: "snip", date: "2026-09-23" },
    ]);
  });

  it("returns a 502 with a distinguishable message when Gmail fails", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "int-test-2@example.com" } } as never);
    vi.mocked(fetchTodaysMessages).mockRejectedValue(new Error("Gmail down"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/Gmail/i);
  });

  it("returns a 502 with a distinguishable message when Gemini fails", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "int-test-3@example.com" } } as never);
    vi.mocked(fetchTodaysMessages).mockResolvedValue([]);
    vi.mocked(summarizeToday).mockRejectedValue(new Error("Gemini down"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/summary/i);
  });

  it("serves a second request from cache without calling Gmail/Gemini again", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "int-test-4@example.com" } } as never);
    vi.mocked(fetchTodaysMessages).mockResolvedValue([]);
    vi.mocked(summarizeToday).mockResolvedValue("No messages received today.");

    await GET();
    await GET();

    expect(fetchTodaysMessages).toHaveBeenCalledTimes(1);
    expect(summarizeToday).toHaveBeenCalledTimes(1);
  });
});
