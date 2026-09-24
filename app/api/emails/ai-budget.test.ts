import { describe, it, expect, vi, beforeEach } from "vitest";

// The daily AI budget running out, with a tiny per-user budget so it can be
// reached in a few requests. Gmail, Gemini and the session are faked; the
// budget counters (in memory, as without DATABASE_URL) are real.
vi.hoisted(() => {
  process.env.AI_CALLS_PER_USER_PER_DAY = "3";
});
vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gmail")>();
  return { GmailAuthError: actual.GmailAuthError, fetchRecentMessages: vi.fn() };
});
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, summarizeToday: vi.fn(), classifyCandidates: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import { fetchRecentMessages, type ParsedEmail } from "@/lib/gmail";
import { classifyCandidates, summarizeToday } from "@/lib/ai";
import { GET as getToday } from "./today/route";
import { GET as getSpam } from "./spam/route";

let user = 0;
function signIn() {
  const id = `gid-budget-${++user}`;
  vi.mocked(getGoogleSession).mockResolvedValue({ userId: id, userEmail: "a@example.com", userName: null, accessToken: "tok", consented: true });
}

function promo(id: string): ParsedEmail {
  return {
    id,
    threadId: `t-${id}`,
    from: "Deals <deals@shop.example>",
    subject: "50% off today",
    snippet: "Limited time",
    date: "",
    listUnsubscribe: "<https://shop.example/u>",
    listUnsubscribePost: null,
    isInInbox: true,
  };
}

function nextUtcMidnight(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

describe("when today's AI budget runs out", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    signIn();
    vi.mocked(summarizeToday).mockResolvedValue([{ id: "m1", bucket: "fyi", action: "", due: "" }]);
    vi.mocked(classifyCandidates).mockImplementation(async (candidates) => ({
      verdicts: candidates.map((e) => ({ id: e.id, isSpam: true, reason: "marketing" as const })),
      checkedIds: candidates.map((e) => e.id),
      attempted: candidates.length,
      error: null,
    }));
  });

  it("the summary says so, with the reset time, instead of claiming AI is unavailable", async () => {
    vi.mocked(fetchRecentMessages).mockResolvedValue({ emails: [promo("m1")], truncated: false, totalEstimate: 1 });
    for (let i = 0; i < 3; i++) {
      const ok = await (await getToday(new Request("http://localhost/api/emails/today?refresh=1"))).json();
      expect(ok.aiStatus).toBe("generated");
    }
    const res = await getToday(new Request("http://localhost/api/emails/today?refresh=1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ aiStatus: "budget", aiResetsAt: nextUtcMidnight(), briefing: null });
    expect(body.groups).not.toBeNull();
    expect(summarizeToday).toHaveBeenCalledTimes(3);
  });

  it("spam: checks what the budget allows, and says the rest wait until the reset", async () => {
    vi.mocked(fetchRecentMessages).mockResolvedValue({
      emails: ["a", "b", "c", "d", "e"].map(promo),
      truncated: false,
      totalEstimate: 5,
    });
    const body = await (await getSpam(new Request("http://localhost/api/emails/spam"))).json();
    expect(vi.mocked(classifyCandidates).mock.calls[0][0]).toHaveLength(3);
    expect(body).toMatchObject({ aiStatus: "generated", unchecked: 2, aiResetsAt: nextUtcMidnight() });
    expect(body.flashcards).toHaveLength(3);

    // Over budget now: the three checked verdicts are reused for free.
    const again = await (await getSpam(new Request("http://localhost/api/emails/spam?refresh=1"))).json();
    expect(classifyCandidates).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ aiStatus: "generated", unchecked: 2 });
  });

  it("spam: with nothing checked by AI yet, shows the rule-based flags and the reset time", async () => {
    vi.mocked(fetchRecentMessages).mockResolvedValue({ emails: [promo("m1")], truncated: false, totalEstimate: 1 });
    for (let i = 0; i < 3; i++) await getToday(new Request("http://localhost/api/emails/today?refresh=1"));
    const body = await (await getSpam(new Request("http://localhost/api/emails/spam"))).json();
    expect(classifyCandidates).not.toHaveBeenCalled();
    expect(body).toMatchObject({ aiStatus: "budget", aiResetsAt: nextUtcMidnight() });
    expect(body.unchecked).toBeUndefined();
  });

  it("only calls actually made are charged", async () => {
    vi.mocked(fetchRecentMessages).mockResolvedValue({ emails: ["a", "b", "c"].map(promo), truncated: false, totalEstimate: 3 });
    // The model only got to one of the three before its time ran out.
    vi.mocked(classifyCandidates).mockImplementationOnce(async (candidates) => ({
      verdicts: [{ id: candidates[0].id, isSpam: true, reason: "marketing" as const }],
      checkedIds: [candidates[0].id],
      attempted: 1,
      error: null,
    }));
    const first = await (await getSpam(new Request("http://localhost/api/emails/spam"))).json();
    expect(first).toMatchObject({ aiStatus: "generated", unchecked: 2 });
    expect(first.aiResetsAt).toBeUndefined();

    // Two calls were given back, so the next load can check the other two.
    const second = await (await getSpam(new Request("http://localhost/api/emails/spam?refresh=1"))).json();
    expect(vi.mocked(classifyCandidates).mock.calls[1][0]).toHaveLength(2);
    expect(second.unchecked).toBeUndefined();
    expect(second.flashcards).toHaveLength(3);
  });
});
