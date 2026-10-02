import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  return { ...actual, triageToday: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import { fetchRecentMessages, type ParsedEmail } from "@/lib/gmail";
import { triageToday } from "@/lib/ai";
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

// A load that needs the model: new mail has arrived since the last one.
let mail = 0;
// The clock moves on a minute first, so Refresh re-reads Gmail.
function newMail(): ParsedEmail[] {
  vi.setSystemTime(Date.now() + 60_000);
  const email = promo(`n${++mail}`);
  vi.mocked(fetchRecentMessages).mockResolvedValue({ emails: [email], truncated: false, totalEstimate: 1 });
  return [email];
}

describe("when today's AI budget runs out", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    signIn();
    vi.mocked(triageToday).mockImplementation(async (emails) => ({
      items: emails.map((e) => ({ id: e.id, bucket: "noise" as const, action: "", due: "", dueDate: "" })),
      verdicts: emails.map((e) => ({ id: e.id, isSpam: true, reason: "marketing" as const })),
    }));
  });

  it("the summary says so, with the reset time, instead of claiming AI is unavailable", async () => {
    for (let i = 0; i < 3; i++) {
      newMail();
      const ok = await (await getToday(new Request("http://localhost/api/emails/today?refresh=1"))).json();
      expect(ok.aiStatus).toBe("generated");
    }
    newMail();
    const res = await getToday(new Request("http://localhost/api/emails/today?refresh=1"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ aiStatus: "budget", aiResetsAt: nextUtcMidnight(), briefing: null });
    expect(body.groups).not.toBeNull();
    expect(triageToday).toHaveBeenCalledTimes(3);
  });

  it("one load charges one call for the summary and the spam list together", async () => {
    for (let i = 0; i < 3; i++) {
      newMail();
      const [today, spam] = await Promise.all([
        getToday(new Request("http://localhost/api/emails/today?refresh=1")),
        getSpam(new Request("http://localhost/api/emails/spam?refresh=1")),
      ]);
      expect((await today.json()).aiStatus).toBe("generated");
      expect((await spam.json()).aiStatus).toBe("generated");
    }
    expect(triageToday).toHaveBeenCalledTimes(3);
  });

  it("spam: with nothing checked by AI yet, shows the rule-based flags and the reset time", async () => {
    for (let i = 0; i < 3; i++) {
      newMail();
      await getToday(new Request("http://localhost/api/emails/today?refresh=1"));
    }
    newMail();
    const body = await (await getSpam(new Request("http://localhost/api/emails/spam?refresh=1"))).json();
    expect(triageToday).toHaveBeenCalledTimes(3);
    expect(body).toMatchObject({ aiStatus: "budget", aiResetsAt: nextUtcMidnight() });
    expect(body.flashcards).toHaveLength(1);
  });

  it("verdicts already known are still shown once the budget is used up", async () => {
    const [email] = newMail();
    await getSpam(new Request("http://localhost/api/emails/spam"));
    for (let i = 0; i < 2; i++) {
      newMail();
      await getToday(new Request("http://localhost/api/emails/today?refresh=1"));
    }
    vi.setSystemTime(Date.now() + 60_000);
    vi.mocked(fetchRecentMessages).mockResolvedValue({ emails: [email], truncated: false, totalEstimate: 1 });
    const body = await (await getSpam(new Request("http://localhost/api/emails/spam?refresh=1"))).json();
    expect(body).toMatchObject({ aiStatus: "generated" });
    expect(body.flashcards.map((c: { id: string }) => c.id)).toEqual([email.id]);
  });
});
