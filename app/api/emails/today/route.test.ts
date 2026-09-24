import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gmail")>();
  return { GmailAuthError: actual.GmailAuthError, fetchRecentMessages: vi.fn() };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, summarizeToday: vi.fn() };
});

import { getGoogleSession } from "@/lib/session";
import { fetchRecentMessages, GmailAuthError, type ParsedEmail } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";
import { GET } from "./route";

function sessionFor(email: string) {
  return { userId: `gid-${email}`, userEmail: email, userName: null, accessToken: "tok", consented: true };
}

function getRequest(query = "") {
  return new Request(`http://localhost/api/emails/today${query}`);
}

const EMAIL: ParsedEmail = {
  id: "m1",
  threadId: "t1",
  from: "sender@example.com",
  subject: "Hi",
  snippet: "snip",
  date: "2026-09-23",
  listUnsubscribe: null,
  listUnsubscribePost: null,
  isInInbox: true,
};

function inbox(emails: ParsedEmail[], truncated = false) {
  return { emails, truncated, totalEstimate: truncated ? 250 : emails.length };
}

// These exercise the actual route handler end to end — auth, Gmail, and
// Gemini are the true external boundaries (mocked); everything in between
// (caching, error shaping, response assembly) is the real code, catching
// exactly the "pieces don't wire together correctly" class of regression
// unit tests of individual functions can't.
describe("GET /api/emails/today", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);

    const res = await GET(getRequest());

    expect(res.status).toBe(401);
  });

  it("returns the summary, count, and mapped emails on success", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-1@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(summarizeToday).mockResolvedValue("**Summary**");

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ summary: "**Summary**", aiStatus: "generated", groups: null, count: 1, truncated: false });
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
    expect(body.emails).toEqual([{ id: "m1", threadId: "t1", from: "sender@example.com", subject: "Hi", date: "2026-09-23" }]);
    expect(summarizeToday).toHaveBeenCalledWith([EMAIL], "en");
  });

  it("writes the summary in the requested language", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-lang@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(summarizeToday).mockResolvedValue("**Résumé**");

    await GET(getRequest("?lang=fr"));

    expect(summarizeToday).toHaveBeenCalledWith([EMAIL], "fr");
  });

  it("reports when the inbox had more messages than it read", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-trunc@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL], true));
    vi.mocked(summarizeToday).mockResolvedValue("**Summary**");

    const body = await (await GET(getRequest())).json();

    expect(body).toMatchObject({ truncated: true, totalEstimate: 250 });
  });

  it("returns a 502 gmail_unavailable when Gmail fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-2@example.com"));
    vi.mocked(fetchRecentMessages).mockRejectedValue(new Error("Gmail down"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ ok: false, code: "gmail_unavailable" });
  });

  it("asks the user to reconnect when Gmail access was revoked", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-revoked@example.com"));
    vi.mocked(fetchRecentMessages).mockRejectedValue(new GmailAuthError());

    const res = await GET(getRequest());

    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("gmail_reconnect");
  });

  it("falls back to rule-based groups when Gemini fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-3@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(summarizeToday).mockRejectedValue(new Error("Gemini down"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ aiStatus: "unavailable", summary: null, groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("serves a second request from cache without calling Gmail/Gemini again", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-4@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(summarizeToday).mockResolvedValue("**Summary**");

    await GET(getRequest());
    await GET(getRequest());

    expect(fetchRecentMessages).toHaveBeenCalledTimes(1);
    expect(summarizeToday).toHaveBeenCalledTimes(1);
  });

  it("Refresh re-reads Gmail once the cached list is more than a few seconds old", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-refresh@example.com"));
      vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
      vi.mocked(summarizeToday).mockResolvedValue("**Summary**");

      await GET(getRequest());
      await GET(getRequest("?refresh=1"));
      expect(fetchRecentMessages).toHaveBeenCalledTimes(1);
      expect(summarizeToday).toHaveBeenCalledTimes(2);

      vi.setSystemTime(Date.now() + 60_000);
      await GET(getRequest("?refresh=1"));
      expect(fetchRecentMessages).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends nothing to Gemini and returns rule-based groups when the paid tier isn't attested", async () => {
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-5@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(summarizeToday).not.toHaveBeenCalled();
    expect(body).toMatchObject({ aiStatus: "off", summary: null, groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("doesn't call Gemini when there are no messages", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-6@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([]));

    const body = await (await GET(getRequest())).json();

    expect(summarizeToday).not.toHaveBeenCalled();
    expect(body).toMatchObject({ count: 0, summary: null });
  });

  it("with the default AI budget, 10 uncached loads for one user in a day all get an AI summary", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-10loads@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(summarizeToday).mockResolvedValue("**Summary**");
    for (let load = 0; load < 10; load++) {
      const body = await (await GET(getRequest("?refresh=1"))).json();
      expect(body).toMatchObject({ aiStatus: "generated", summary: "**Summary**" });
    }
    expect(summarizeToday).toHaveBeenCalledTimes(10);
  });
});
