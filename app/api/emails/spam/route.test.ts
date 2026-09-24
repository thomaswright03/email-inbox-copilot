import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gmail")>();
  return { GmailAuthError: actual.GmailAuthError, fetchRecentMessages: vi.fn() };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, classifyCandidates: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import { fetchRecentMessages, type ParsedEmail } from "@/lib/gmail";
import { markIgnored } from "@/lib/ignored";
import { classifyCandidates, type SpamVerdict } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";
import { GET } from "./route";

function sessionFor(email: string) {
  return { userId: `gid-${email}`, userEmail: email, userName: null, accessToken: "tok", consented: true };
}

function getRequest() {
  return new Request("http://localhost/api/emails/spam");
}

const EMAIL: ParsedEmail = {
  id: "m1",
  threadId: "t1",
  from: "spammer@example.com",
  subject: "Buy now",
  snippet: "50% off",
  date: "2026-09-23",
  listUnsubscribe: "<https://example.com/unsub>",
  listUnsubscribePost: "List-Unsubscribe=One-Click",
  isInInbox: true,
};

// What classifyCandidates returns when every email got a usable answer.
function classified(verdicts: SpamVerdict[]) {
  return { verdicts, checkedIds: verdicts.map((v) => v.id), attempted: verdicts.length, error: null };
}

function inbox(emails: ParsedEmail[]) {
  return { emails, truncated: false, totalEstimate: emails.length };
}

describe("GET /api/emails/spam", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("builds flashcards only for messages classified as spam, and logs each one", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-1@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(classifyCandidates).mockResolvedValue(classified([{ id: "m1", isSpam: true, reason: "marketing" }]));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.flashcards).toEqual([
      {
        id: "m1",
        threadId: "t1",
        from: "spammer@example.com",
        subject: "Buy now",
        snippet: "50% off",
        reason: "marketing",
        unsubscribe: { kind: "one-click" },
      },
    ]);
    expect(logAuditEvent).toHaveBeenCalledWith({
      userId: "gid-int-spam-1@example.com",
      action: "classified_spam",
      messageId: "m1",
    });
  });

  it("omits a message classified as not spam", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-2@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(classifyCandidates).mockResolvedValue(classified([{ id: "m1", isSpam: false, reason: "legitimate" }]));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(body.flashcards).toEqual([]);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("falls back to rule-based flags when Gemini classification fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-3@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(classifyCandidates).mockResolvedValue({ verdicts: [], checkedIds: [], attempted: 1, error: new Error("Gemini down") });

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.aiStatus).toBe("unavailable");
    expect(Array.isArray(body.flashcards)).toBe(true);
  });

  it("returns a 502 gmail_unavailable when Gmail fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-gmail@example.com"));
    vi.mocked(fetchRecentMessages).mockRejectedValue(new Error("Gmail down"));

    const res = await GET(getRequest());

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("gmail_unavailable");
  });

  it("leaves out a message the user marked Not spam, even from a cached response", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-ignored@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(classifyCandidates).mockResolvedValue(classified([{ id: "m1", isSpam: true, reason: "marketing" }]));

    expect((await (await GET(getRequest())).json()).flashcards).toHaveLength(1);
    await markIgnored("gid-int-spam-ignored@example.com", "m1");
    expect((await (await GET(getRequest())).json()).flashcards).toEqual([]);
    expect(classifyCandidates).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an https link without one-click", { listUnsubscribe: "<https://example.com/u>", listUnsubscribePost: null }, { kind: "link", url: "https://example.com/u" }],
    ["no header", { listUnsubscribe: null, listUnsubscribePost: null }, null],
  ])("describes how to unsubscribe for %s", async (_, headers, expected) => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor(`int-spam-unsub-${expected?.kind ?? "none"}@example.com`));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([{ ...EMAIL, ...headers }]));
    vi.mocked(classifyCandidates).mockResolvedValue(classified([{ id: "m1", isSpam: true, reason: "marketing" }]));

    const body = await (await GET(getRequest())).json();

    expect(body.flashcards[0].unsubscribe).toEqual(expected);
  });

  it("does not re-log classification events when a second request is served from cache", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-4@example.com"));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([EMAIL]));
    vi.mocked(classifyCandidates).mockResolvedValue(classified([{ id: "m1", isSpam: true, reason: "marketing" }]));

    await GET(getRequest());
    await GET(getRequest());

    expect(classifyCandidates).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });

  it("uses the rule-based spam flags and sends nothing to Gemini when the paid tier isn't attested", async () => {
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-5@example.com"));
    const promo = { ...EMAIL, subject: "LIMITED TIME: 50% OFF everything", snippet: "Unsubscribe any time" };
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox([promo]));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(classifyCandidates).not.toHaveBeenCalled();
    expect(body.aiStatus).toBe("off");
    expect(body.flashcards).toHaveLength(1);
    expect(body.flashcards[0]).toMatchObject({ id: "m1", reason: "newsletter" });
  });

  it("checks every candidate with AI across loads: 20 per load, the rest on the next one, each only once", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-25@example.com"));
    const promos = Array.from({ length: 25 }, (_, i) => ({ ...EMAIL, id: `p${i}`, threadId: `tp${i}` }));
    vi.mocked(fetchRecentMessages).mockResolvedValue(inbox(promos));
    vi.mocked(classifyCandidates).mockImplementation(async (candidates) =>
      classified(candidates.map((e) => ({ id: e.id, isSpam: true, reason: "marketing" as const })))
    );

    const first = await (await GET(getRequest())).json();
    expect(vi.mocked(classifyCandidates).mock.calls[0][0]).toHaveLength(20);
    expect(first).toMatchObject({ aiStatus: "generated", unchecked: 5 });
    expect(first.aiResetsAt).toBeUndefined();
    expect(first.flashcards).toHaveLength(20);

    const second = await (await GET(new Request("http://localhost/api/emails/spam?refresh=1"))).json();
    const secondBatch = vi.mocked(classifyCandidates).mock.calls[1][0].map((e) => e.id);
    expect(secondBatch).toHaveLength(5);
    expect(secondBatch.some((id) => first.flashcards.some((c: { id: string }) => c.id === id))).toBe(false);
    expect(second.unchecked).toBeUndefined();
    expect(second.flashcards).toHaveLength(25);

    // Everything is checked now: another Refresh sends nothing to Gemini.
    await GET(new Request("http://localhost/api/emails/spam?refresh=1"));
    expect(classifyCandidates).toHaveBeenCalledTimes(2);
  });

  it("with the default AI budget, 10 uncached loads in a day all get AI verdicts", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-10loads@example.com"));
    let round = 0;
    vi.mocked(classifyCandidates).mockImplementation(async (candidates) =>
      classified(candidates.map((e) => ({ id: e.id, isSpam: true, reason: "marketing" as const })))
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      for (let load = 0; load < 10; load++) {
        // A new batch of 10 promotional emails arrives before every load,
        // and each load re-reads Gmail (the cached list is a minute old).
        vi.setSystemTime(Date.now() + 60_000);
        round++;
        const fresh = Array.from({ length: 10 }, (_, i) => ({ ...EMAIL, id: `r${round}x${i}`, threadId: `r${round}x${i}` }));
        vi.mocked(fetchRecentMessages).mockResolvedValue(inbox(fresh));
        const body = await (await GET(new Request("http://localhost/api/emails/spam?refresh=1"))).json();
        expect(body.aiStatus).toBe("generated");
        expect(body.flashcards.map((c: { id: string }) => c.id)).toEqual(fresh.map((e) => e.id));
      }
      expect(classifyCandidates).toHaveBeenCalledTimes(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
