import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A big inbox is triaged in chunks of 25 emails, one Gemini call each, made
// at the same time (lib/triage.ts). A failed chunk falls back to the rules
// for just its emails, a failure is kept for a short back-off so reloads
// don't burn calls, and every call is charged to the daily AI budget.
// Gmail, the model call, the audit log and the session are faked; the
// routes, caches and budget counters (in memory, as without DATABASE_URL)
// are the real code.
vi.hoisted(() => {
  process.env.AI_CALLS_PER_USER_PER_DAY = "5";
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
import { TRIAGE_CHUNK_SIZE, triageChunks, triageToday, type Triage } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";
import { TRIAGE_FAILURE_BACKOFF_MS } from "@/lib/triage";
import { GET as getToday } from "./today/route";
import { GET as getSpam } from "./spam/route";

let user = 0;
function signIn() {
  const id = `gid-chunks-${++user}`;
  vi.mocked(getGoogleSession).mockResolvedValue({ userId: id, userEmail: "a@example.com", userName: null, accessToken: "tok", consented: true });
}

// Ordinary mail, except every tenth email is an obvious promotion.
function email(id: string, i: number): ParsedEmail {
  const promo = i % 10 === 0;
  return {
    id,
    threadId: `t-${id}`,
    from: promo ? "Deals <deals@shop.example>" : `Person ${i} <p${i}@example.com>`,
    subject: promo ? "LIMITED TIME: 50% off" : `Question ${i}`,
    snippet: promo ? "Act now, click here" : "Can you take a look?",
    date: "",
    listUnsubscribe: promo ? "<https://shop.example/u>" : null,
    listUnsubscribePost: null,
    isInInbox: true,
  };
}

let batch = 0;
function inboxOf(count: number): ParsedEmail[] {
  batch++;
  const emails = Array.from({ length: count }, (_, i) => email(`b${batch}m${i}`, i));
  vi.mocked(fetchRecentMessages).mockResolvedValue({ emails, truncated: false, totalEstimate: count });
  return emails;
}

// What a careful model answers for one chunk: every email needs a reply,
// and the promotions are spam.
function answer(emails: ParsedEmail[]): Triage {
  return {
    items: emails.map((e) => ({ id: e.id, bucket: "reply" as const, action: `Answer ${e.id}`, due: "", dueDate: "" })),
    verdicts: emails.map((e) =>
      e.listUnsubscribe ? { id: e.id, isSpam: true, reason: "marketing" as const } : { id: e.id, isSpam: false, reason: "legitimate" as const }
    ),
  };
}

const load = (query = "") => getToday(new Request(`http://localhost/api/emails/today${query}`));

describe("triage in chunks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    signIn();
  });
  afterEach(() => vi.useRealTimers());

  it("splits the inbox into chunks of 25, newest first", () => {
    const emails = Array.from({ length: 60 }, (_, i) => i);
    expect(triageChunks(emails).map((c) => c.length)).toEqual([25, 25, 10]);
    expect(triageChunks(emails)[1][0]).toBe(25);
    expect(triageChunks(Array.from({ length: 100 }, (_, i) => i))).toHaveLength(4);
    expect(triageChunks([])).toEqual([]);
    expect(TRIAGE_CHUNK_SIZE).toBe(25);
  });

  it("makes one call per chunk, all at the same time, and one load's calls serve both tabs", async () => {
    const emails = inboxOf(60);
    let inFlight = 0;
    let most = 0;
    vi.mocked(triageToday).mockImplementation(async (chunk) => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return answer(chunk);
    });

    const [today, spam] = await Promise.all([load(), getSpam(new Request("http://localhost/api/emails/spam"))]);
    const body = await today.json();

    expect(vi.mocked(triageToday).mock.calls.map(([chunk]) => chunk.map((e) => e.id))).toEqual(triageChunks(emails.map((e) => e.id)));
    expect(most).toBe(3);
    expect(body.aiStatus).toBe("generated");
    expect(body.briefing).toHaveLength(60);
    expect(body.briefing.every((item: { bucket: string }) => item.bucket === "reply")).toBe(true);
    expect((await spam.json()).flashcards).toHaveLength(6);
  });

  it("a failed chunk falls back to the rules for just its emails", async () => {
    const emails = inboxOf(60);
    vi.mocked(triageToday).mockImplementation(async (chunk) => {
      if (chunk[0].id === emails[25].id) throw new Error("Gemini timed out");
      return answer(chunk);
    });

    const body = await (await load()).json();
    const spam = await (await getSpam(new Request("http://localhost/api/emails/spam"))).json();

    expect(body.aiStatus).toBe("generated");
    const byId = new Map(body.briefing.map((item: { id: string }) => [item.id, item]));
    // Chunks 1 and 3: the model's answer.
    expect(byId.get(emails[0].id)).toMatchObject({ bucket: "reply", action: `Answer ${emails[0].id}` });
    expect(byId.get(emails[59].id)).toMatchObject({ bucket: "reply" });
    // Chunk 2: the rules (a promotion is Noise, the rest FYI, no action line).
    expect(byId.get(emails[30].id)).toEqual({ id: emails[30].id, bucket: "noise", action: "", due: "", dueDate: "" });
    expect(byId.get(emails[31].id)).toEqual({ id: emails[31].id, bucket: "fyi", action: "", due: "", dueDate: "" });
    // Spam cards from both, each logged with who flagged it.
    expect(spam.flashcards.map((c: { id: string }) => c.id)).toEqual(emails.filter((e) => e.listUnsubscribe).map((e) => e.id));
    const detail = new Map(vi.mocked(logAuditEvent).mock.calls.map(([entry]) => [entry.messageId, entry.detail]));
    expect(detail.get(emails[20].id)).toBe("flagged by AI");
    expect(detail.get(emails[30].id)).toBe("flagged by rules");
    expect(triageToday).toHaveBeenCalledTimes(3);
  });

  it("keeps a partial answer only for the back-off, then asks again", async () => {
    const emails = inboxOf(30);
    vi.mocked(triageToday).mockImplementation(async (chunk) => {
      if (chunk[0].id === emails[25].id) throw new Error("Gemini timed out");
      return answer(chunk);
    });
    await load();
    expect(triageToday).toHaveBeenCalledTimes(2);

    // Reloading within the back-off makes no new call.
    await load("?refresh=1");
    expect(triageToday).toHaveBeenCalledTimes(2);

    vi.setSystemTime(Date.now() + TRIAGE_FAILURE_BACKOFF_MS + 1_000);
    vi.mocked(triageToday).mockImplementation(async (chunk) => answer(chunk));
    const body = await (await load("?refresh=1")).json();
    expect(triageToday).toHaveBeenCalledTimes(4);
    expect(body.briefing.every((item: { bucket: string }) => item.bucket === "reply")).toBe(true);
  });

  it("when every call fails, reloads during the back-off don't make new calls", async () => {
    inboxOf(30);
    vi.mocked(triageToday).mockRejectedValue(new Error("Gemini down"));

    expect(await (await load()).json()).toMatchObject({ aiStatus: "unavailable", briefing: null });
    expect(triageToday).toHaveBeenCalledTimes(2);

    for (let i = 0; i < 3; i++) {
      vi.setSystemTime(Date.now() + 10_000);
      expect(await (await load("?refresh=1")).json()).toMatchObject({ aiStatus: "unavailable" });
      await getSpam(new Request("http://localhost/api/emails/spam?refresh=1"));
    }
    expect(triageToday).toHaveBeenCalledTimes(2);

    // After the back-off, Gemini is asked again.
    vi.setSystemTime(Date.now() + TRIAGE_FAILURE_BACKOFF_MS);
    vi.mocked(triageToday).mockImplementation(async (chunk) => answer(chunk));
    expect(await (await load("?refresh=1")).json()).toMatchObject({ aiStatus: "generated" });
    expect(triageToday).toHaveBeenCalledTimes(4);
  });

  it("charges the AI budget one call per chunk; chunks it has no room for use the rules", async () => {
    vi.mocked(triageToday).mockImplementation(async (chunk) => answer(chunk));
    inboxOf(60);
    await load();
    expect(triageToday).toHaveBeenCalledTimes(3);

    // 2 of the 5 calls a day are left: the two newest chunks get the model.
    vi.setSystemTime(Date.now() + 60_000);
    const emails = inboxOf(60);
    const body = await (await load("?refresh=1")).json();
    expect(triageToday).toHaveBeenCalledTimes(5);
    expect(vi.mocked(triageToday).mock.calls.slice(3).map(([chunk]) => chunk[0].id)).toEqual([emails[0].id, emails[25].id]);
    expect(body.aiStatus).toBe("generated");
    expect(body.briefing.find((item: { id: string }) => item.id === emails[55].id)).toMatchObject({ bucket: "fyi", action: "" });

    // Nothing is left: the next load is the rule-based view, and says why.
    vi.setSystemTime(Date.now() + TRIAGE_FAILURE_BACKOFF_MS + 1_000);
    inboxOf(10);
    expect(await (await load("?refresh=1")).json()).toMatchObject({ aiStatus: "budget", briefing: null });
    expect(triageToday).toHaveBeenCalledTimes(5);
  });
});
