import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", () => ({ fetchTodaysMessages: vi.fn() }));
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, classifySpam: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import { fetchTodaysMessages } from "@/lib/gmail";
import { classifySpam } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";
import { GET } from "./route";

function sessionFor(email: string) {
  return { userId: `gid-${email}`, userEmail: email, userName: null, accessToken: "tok", consented: true };
}

function getRequest() {
  return new Request("http://localhost/api/emails/spam");
}

const EMAIL = {
  id: "m1",
  threadId: "t1",
  from: "spammer@example.com",
  subject: "Buy now",
  snippet: "50% off",
  date: "2026-09-23",
  listUnsubscribe: "<https://example.com/unsub>",
  isInInbox: true,
};

describe("GET /api/emails/spam", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);
    const res = await GET(getRequest());
    expect(res.status).toBe(401);
  });

  it("builds flashcards only for messages classified as spam, and logs each one", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-1@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);
    vi.mocked(classifySpam).mockResolvedValue([{ id: "m1", isSpam: true, reason: "marketing" }]);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.flashcards).toEqual([
      {
        id: "m1",
        from: "spammer@example.com",
        subject: "Buy now",
        snippet: "50% off",
        hasUnsubscribe: true,
        reason: "marketing",
      },
    ]);
    expect(logAuditEvent).toHaveBeenCalledWith({
      userEmail: "int-spam-1@example.com",
      action: "classified_spam",
      messageId: "m1",
      detail: "marketing",
    });
  });

  it("omits a message classified as not spam", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-2@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);
    vi.mocked(classifySpam).mockResolvedValue([{ id: "m1", isSpam: false, reason: "legit" }]);

    const res = await GET(getRequest());
    const body = await res.json();

    expect(body.flashcards).toEqual([]);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("returns a 502 when Gemini classification fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-3@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);
    vi.mocked(classifySpam).mockRejectedValue(new Error("Gemini down"));

    const res = await GET(getRequest());
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toMatch(/spam/i);
  });

  it("does not re-log classification events when a second request is served from cache", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("int-spam-4@example.com"));
    vi.mocked(fetchTodaysMessages).mockResolvedValue([EMAIL]);
    vi.mocked(classifySpam).mockResolvedValue([{ id: "m1", isSpam: true, reason: "marketing" }]);

    await GET(getRequest());
    await GET(getRequest());

    expect(classifySpam).toHaveBeenCalledTimes(1);
    expect(logAuditEvent).toHaveBeenCalledTimes(1);
  });
});
