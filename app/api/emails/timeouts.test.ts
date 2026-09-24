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
import { GEMINI_TIMEOUT_MS } from "@/lib/ai";
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
    await vi.advanceTimersByTimeAsync(GEMINI_TIMEOUT_MS.summary);
    expect(settled).toBe(true);
    const body = await (await pending).json();
    expect(body).toMatchObject({ aiStatus: "unavailable", summary: null, groups: { toCheck: ["m1"], bulk: [] } });
  });

  it("the server gives up before the dashboard does", () => {
    expect(GMAIL_READ_DEADLINE_MS + GEMINI_TIMEOUT_MS.summary).toBeLessThan(FETCH_TIMEOUT_MS);
  });
});
