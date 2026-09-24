import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gmail")>();
  return { GmailAuthError: actual.GmailAuthError, fetchRecentMessages: vi.fn() };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, triageToday: vi.fn() };
});

import { getGoogleSession } from "@/lib/session";
import { fetchRecentMessages, GmailAuthError, type ParsedEmail } from "@/lib/gmail";
import { triageToday } from "@/lib/ai";
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

const BRIEFING = [{ id: "m1", bucket: "reply" as const, action: "Answer the sender", due: "Fri", dueDate: "2026-09-25" }];
const TRIAGE = { items: BRIEFING, verdicts: [{ id: "m1", isSpam: false, reason: "legitimate" as const }] };

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

  it("returns the briefing, count, and mapped emails on success", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-1@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(triageToday).mockResolvedValue(TRIAGE);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ briefing: BRIEFING, aiStatus: "generated", groups: null, count: 1, truncated: false, localDate: expect.any(String) });
    expect(Date.parse(body.generatedAt)).not.toBeNaN();
    expect(body.emails).toEqual([{ id: "m1", threadId: "t1", from: "sender@example.com", subject: "Hi", date: "2026-09-23" }]);
    expect(triageToday).toHaveBeenCalledWith([EMAIL], { language: "en", now: expect.any(String) });
  });

  it("falls back to rule-based groups when the model's briefing was unusable", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-cut@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(triageToday).mockResolvedValue(null);

    const body = await (await GET(getRequest())).json();

    expect(body).toMatchObject({ briefing: null, aiStatus: "unavailable", groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("makes no model call when nothing listed is still in the inbox, and says nothing is left", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-archived@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([{ ...EMAIL, isInInbox: false }]));

    const body = await (await GET(getRequest())).json();

    expect(triageToday).not.toHaveBeenCalled();
    expect(body).toMatchObject({ briefing: [], aiStatus: "generated", groups: null, count: 1 });
  });

  it("reads Gmail from the user's local midnight, and keeps each day's cache apart", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 7 pm on Sept 23 in Los Angeles; already Sept 24 in UTC.
      vi.setSystemTime(new Date("2026-09-24T02:00:00Z"));
      vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-tz@example.com"));
      vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
      vi.mocked(triageToday).mockResolvedValue(TRIAGE);

      const first = await (await GET(getRequest("?tz=America%2FLos_Angeles"))).json();
      expect(fetchRecentMessages).toHaveBeenLastCalledWith("tok", Date.parse("2026-09-23T07:00:00Z") / 1000);
      // The model is told the user's own date, time and zone, and "due
      // today" is measured against the same local date.
      expect(vi.mocked(triageToday).mock.calls[0][1]).toEqual({
        language: "en",
        now: "Wednesday, 2026-09-23, 19:00 (America/Los_Angeles)",
      });
      expect(first.localDate).toBe("2026-09-23");

      // Past the user's midnight: a new day, read afresh.
      vi.setSystemTime(new Date("2026-09-24T07:30:00Z"));
      await GET(getRequest("?tz=America%2FLos_Angeles"));
      expect(fetchRecentMessages).toHaveBeenCalledTimes(2);
      expect(fetchRecentMessages).toHaveBeenLastCalledWith("tok", Date.parse("2026-09-24T07:00:00Z") / 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes the summary in the requested language", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-lang@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(triageToday).mockResolvedValue(TRIAGE);

    await GET(getRequest("?lang=fr"));

    expect(triageToday).toHaveBeenCalledWith([EMAIL], { language: "fr", now: expect.any(String) });
  });

  it("reports when the inbox had more messages than it read", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-trunc@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL], true));
    vi.mocked(triageToday).mockResolvedValue(TRIAGE);

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
    vi.mocked(triageToday).mockRejectedValue(new Error("Gemini down"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ aiStatus: "unavailable", briefing: null, groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("serves a second request from cache without calling Gmail/Gemini again", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-4@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(triageToday).mockResolvedValue(TRIAGE);

    await GET(getRequest());
    await GET(getRequest());

    expect(fetchRecentMessages).toHaveBeenCalledTimes(1);
    expect(triageToday).toHaveBeenCalledTimes(1);
  });

  it("Refresh re-reads Gmail once the cached list is more than a few seconds old, and asks the model again only about new mail", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-refresh@example.com"));
      vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
      vi.mocked(triageToday).mockResolvedValue(TRIAGE);

      await GET(getRequest());
      await GET(getRequest("?refresh=1"));
      expect(fetchRecentMessages).toHaveBeenCalledTimes(1);
      // Same inbox: the cached triage still covers it.
      expect(triageToday).toHaveBeenCalledTimes(1);

      vi.setSystemTime(Date.now() + 60_000);
      const NEW = { ...EMAIL, id: "m2", threadId: "t2" };
      vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([NEW, EMAIL]));
      await GET(getRequest("?refresh=1"));
      expect(fetchRecentMessages).toHaveBeenCalledTimes(2);
      expect(triageToday).toHaveBeenCalledTimes(2);
      expect(vi.mocked(triageToday).mock.calls[1][0]).toEqual([NEW, EMAIL]);
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
    expect(triageToday).not.toHaveBeenCalled();
    expect(body).toMatchObject({ aiStatus: "off", briefing: null, groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("doesn't call Gemini when there are no messages", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-6@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([]));

    const body = await (await GET(getRequest())).json();

    expect(triageToday).not.toHaveBeenCalled();
    expect(body).toMatchObject({ count: 0, briefing: null });
  });

  it("with the default AI budget, 10 loads with new mail for one user in a day all get an AI briefing", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-test-10loads@example.com"));
    vi.mocked(triageToday).mockImplementation(async (emails) => ({
      items: emails.map((e) => ({ id: e.id, bucket: "fyi" as const, action: "", due: "", dueDate: "" })),
      verdicts: [],
    }));
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (let load = 0; load < 10; load++) {
        vi.setSystemTime(Date.now() + 60_000);
        vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([{ ...EMAIL, id: `n${load}` }]));
        const body = await (await GET(getRequest("?refresh=1"))).json();
        expect(body).toMatchObject({ aiStatus: "generated", briefing: [{ id: `n${load}` }] });
      }
    } finally {
      vi.useRealTimers();
    }
    expect(triageToday).toHaveBeenCalledTimes(10);
  });
});
