import { describe, it, expect, vi, beforeEach } from "vitest";

// One dashboard load = GET /api/emails/today + GET /api/emails/spam, in
// parallel. Only the Gmail REST client and the session are faked, so the
// shared message cache, retries and error mapping are the real code.
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
vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import { GET as getToday } from "./today/route";
import { GET as getSpam } from "./spam/route";

let user = 0;
function signIn() {
  // A fresh user per test, so caches from one test never serve another.
  const id = `gid-load-${++user}`;
  vi.mocked(getGoogleSession).mockResolvedValue({ userId: id, userEmail: "a@example.com", userName: null, accessToken: "tok", consented: true });
}

function message(id: string, subject: string, extraHeaders: { name: string; value: string }[] = []) {
  return {
    data: {
      id,
      threadId: `t-${id}`,
      snippet: subject,
      labelIds: ["INBOX"],
      payload: { headers: [{ name: "From", value: `${id}@example.com` }, { name: "Subject", value: subject }, ...extraHeaders] },
    },
  };
}

describe("one dashboard load", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    signIn();
    api.list.mockResolvedValue({ data: { messages: [{ id: "m1" }, { id: "m2" }], resultSizeEstimate: 2 } });
    api.get.mockImplementation(async ({ id }: { id: string }) =>
      id === "m1"
        ? message("m1", "Lunch on Friday?")
        : message("m2", "LIMITED TIME: 50% OFF", [{ name: "List-Unsubscribe", value: "<https://shop.example/u>" }])
    );
  });

  it("reads the Gmail message list once for both the summary and the spam list", async () => {
    const [today, spam] = await Promise.all([
      getToday(new Request("http://localhost/api/emails/today")),
      getSpam(new Request("http://localhost/api/emails/spam")),
    ]);
    expect(today.status).toBe(200);
    expect(spam.status).toBe(200);
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect((await spam.json()).flashcards.map((c: { id: string }) => c.id)).toEqual(["m2"]);
    expect((await today.json()).count).toBe(2);
  });

  it("recovers from a transient Gmail 503 and still answers 200", async () => {
    api.list
      .mockRejectedValueOnce(Object.assign(new Error("Backend Error"), { status: 503 }))
      .mockResolvedValue({ data: { messages: [{ id: "m1" }], resultSizeEstimate: 1 } });
    const res = await getToday(new Request("http://localhost/api/emails/today"));
    expect(res.status).toBe(200);
    expect((await res.json()).count).toBe(1);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("a Gmail 401 is reported as lost access, not as an outage", async () => {
    api.list.mockRejectedValue(Object.assign(new Error("Invalid Credentials"), { status: 401 }));
    const res = await getSpam(new Request("http://localhost/api/emails/spam"));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: "gmail_reconnect" });
  });
});
