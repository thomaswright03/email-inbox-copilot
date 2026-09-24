import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A Gmail or Gemini that never answers: the routes still answer, within the
// bounds in lib/gmail.ts and lib/ai.ts. Only the Gmail REST client, the
// Gemini SDK and the session are faked.
const api = { list: vi.fn(), get: vi.fn() };
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    gmail: () => ({ users: { messages: api } }),
  },
}));
const generateContent = vi.fn();
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));
vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import { GMAIL_READ_DEADLINE_MS } from "@/lib/gmail";
import { GEMINI_TIMEOUT_MS, TRIAGE_CHUNK_SIZE, triageTimeoutMs } from "@/lib/ai";
import { FETCH_TIMEOUT_MS } from "@/lib/client-fetch";
import { GET as getToday } from "./today/route";

const never = () => new Promise(() => {});

let user = 0;
function signIn() {
  vi.mocked(getGoogleSession).mockResolvedValue({
    userId: `gid-timeout-${++user}`,
    userEmail: "a@example.com",
    userName: null,
    accessToken: "tok",
    consented: true,
  });
}

function message(id: string) {
  return {
    data: {
      id,
      threadId: `t-${id}`,
      snippet: "Lunch on Friday?",
      labelIds: ["INBOX"],
      payload: { headers: [{ name: "From", value: `${id}@example.com` }, { name: "Subject", value: "Lunch" }] },
    },
  };
}

describe("when an upstream never answers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    signIn();
  });
  afterEach(() => vi.useRealTimers());

  it("a hung Gmail becomes 'Couldn't reach Gmail' within the read deadline", async () => {
    api.list.mockImplementation(never);
    let settled = false;
    const pending = getToday(new Request("http://localhost/api/emails/today")).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(GMAIL_READ_DEADLINE_MS);
    expect(settled).toBe(true);
    const res = await pending;
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ code: "gmail_unavailable" });
  });

  it("one hung message read fails the load the same way", async () => {
    api.list.mockResolvedValue({ data: { messages: [{ id: "m1" }, { id: "m2" }], resultSizeEstimate: 2 } });
    api.get.mockImplementation(async ({ id }: { id: string }) => (id === "m2" ? never() : message(id)));
    const pending = getToday(new Request("http://localhost/api/emails/today"));
    await vi.advanceTimersByTimeAsync(GMAIL_READ_DEADLINE_MS);
    expect((await pending).status).toBe(502);
  });

  it("a hung Gemini falls back to the rule-based list within its timeout", async () => {
    api.list.mockResolvedValue({ data: { messages: [{ id: "m1" }], resultSizeEstimate: 1 } });
    api.get.mockImplementation(async ({ id }: { id: string }) => message(id));
    generateContent.mockImplementation(never);
    let settled = false;
    const pending = getToday(new Request("http://localhost/api/emails/today")).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS);
    expect(settled).toBe(true);
    const body = await (await pending).json();
    expect(body).toMatchObject({ aiStatus: "unavailable", briefing: null, groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("a hung Gemini on a full inbox (4 triage calls at once) falls back within the same timeout", async () => {
    const ids = Array.from({ length: 100 }, (_, i) => `m${i}`);
    api.list.mockResolvedValue({ data: { messages: ids.map((id) => ({ id })), resultSizeEstimate: 100 } });
    api.get.mockImplementation(async ({ id }: { id: string }) => message(id));
    generateContent.mockImplementation(never);
    let settled = false;
    const pending = getToday(new Request("http://localhost/api/emails/today")).finally(() => (settled = true));
    await vi.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS);
    expect(settled).toBe(true);
    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(await (await pending).json()).toMatchObject({ aiStatus: "unavailable", briefing: null });
  });

  it("each triage call's timeout grows with its emails, up to GEMINI_TIMEOUT_MS for a full chunk", () => {
    expect(triageTimeoutMs(1)).toBeGreaterThanOrEqual(10_000);
    expect(triageTimeoutMs(10)).toBeLessThan(triageTimeoutMs(TRIAGE_CHUNK_SIZE));
    expect(triageTimeoutMs(TRIAGE_CHUNK_SIZE)).toBe(GEMINI_TIMEOUT_MS);
    expect(triageTimeoutMs(100)).toBe(GEMINI_TIMEOUT_MS);
  });

  it("the server gives up before the dashboard does", () => {
    expect(GMAIL_READ_DEADLINE_MS + GEMINI_TIMEOUT_MS).toBeLessThan(FETCH_TIMEOUT_MS);
  });
});
