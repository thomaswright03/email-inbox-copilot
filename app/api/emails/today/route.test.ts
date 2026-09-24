import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", () => ({ fetchTodaysMessages: vi.fn() }));
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, summarizeToday: vi.fn() };
});

import { getGoogleSession } from "@/lib/session";
import { fetchTodaysMessages } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";
import { GET } from "./route";

function sessionFor(email: string) {
  return { userId: `gid-${email}`, userEmail: email, userName: null, accessToken: "tok", consented: true };
}

function getRequest() {
  return new Request("http://localhost/api/emails/today");
}

const EMAIL = {
  id: "m1",
  threadId: "t1",
  from: "sender@example.com",
  subject: "Hi",
  snippet: "snip",
  date: "2026-09-23",
  listUnsubscribe: null,
  isInInbox: true,
};

// These exercise the actual route handler end to end — auth, Gmail, and
// Gemini are the true external boundaries (mocked); everything in between
// (caching, error shaping, response assembly) is the real code, catching
// exactly the "pieces don't wire together correctly" class of regression
// unit tests of individual functions can't.
describe("GET /api/emails/today", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });

  it("returns the summary, count, and mapped emails on success", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-1@example.com"));
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

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summary).toBe("**Summary**");
    expect(body.aiGenerated).toBe(true);
    expect(body.count).toBe(1);
    expect(body.emails).toEqual([
      { id: "m1", from: "sender@example.com", subject: "Hi", snippet: "snip", date: "2026-09-23" },
    ]);
  });

  it("returns a 502 with a distinguishable message when Gmail fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-2@example.com"));
    vi.mocked(fetchTodaysMessages).mockRejectedValue(new Error("Gmail down"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/Gmail/i);
  });

  it("returns a 502 with a distinguishable message when Gemini fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-3@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);
    vi.mocked(summarizeToday).mockRejectedValue(new Error("Gemini down"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/summary/i);
  });

  it("serves a second request from cache without calling Gmail/Gemini again", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-4@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);
    vi.mocked(summarizeToday).mockResolvedValue("**Summary**");

    await GET(getRequest());
    await GET(getRequest());

    expect(fetchTodaysMessages).toHaveBeenCalledTimes(1);
    expect(summarizeToday).toHaveBeenCalledTimes(1);
  });

  it("sends nothing to Gemini and returns a rule-based summary when the paid tier isn't attested", async () => {
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-5@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(summarizeToday).not.toHaveBeenCalled();
    expect(body.aiGenerated).toBe(false);
    expect(body.summary).toContain("Messages to check (1)");
  });

  it("doesn't call Gemini when there are no messages", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-6@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([]);

    const body = await (await GET(getRequest())).json();

    expect(summarizeToday).not.toHaveBeenCalled();
    expect(body.summary).toBe("No messages received today.");
  });
});
