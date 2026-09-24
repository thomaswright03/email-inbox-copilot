import { describe, it, expect, vi, beforeEach } from "vitest";

// Done (archive) and its Undo change the mailbox, so the next load re-reads
// Gmail, but the model's answer for the day is kept: no new Gemini call is
// made for a message that only left or came back to the inbox. Gmail's
// REST client, the session and the model call are faked; the routes,
// caches and AI budget are the real code.
const labels = new Map<string, string[]>();
const api = {
  list: vi.fn(async () => ({
    data: { messages: [...labels.keys()].map((id) => ({ id })), resultSizeEstimate: labels.size },
  })),
  get: vi.fn(async ({ id }: { id: string }) => ({
    data: {
      id,
      threadId: `t-${id}`,
      snippet: `Snippet ${id}`,
      labelIds: labels.get(id),
      payload: { headers: [{ name: "From", value: `${id}@example.com` }, { name: "Subject", value: `Subject ${id}` }] },
    },
  })),
  modify: vi.fn(async ({ id, requestBody }: { id: string; requestBody: { addLabelIds?: string[]; removeLabelIds?: string[] } }) => {
    const next = (labels.get(id) ?? []).filter((l) => !(requestBody.removeLabelIds ?? []).includes(l));
    labels.set(id, [...next, ...(requestBody.addLabelIds ?? [])]);
    return { data: {} };
  }),
};
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
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, triageToday: vi.fn() };
});

import { getGoogleSession } from "@/lib/session";
import { triageToday } from "@/lib/ai";
import { GET as getToday } from "./today/route";
import { POST as postAction } from "../actions/route";

function action(action: string, messageId: string) {
  return postAction(
    new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({ action, messageId }),
    })
  );
}

async function load() {
  return (await getToday(new Request("http://localhost/api/emails/today"))).json();
}

describe("Done, then the next load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    labels.clear();
    labels.set("m1", ["INBOX"]);
    labels.set("m2", ["INBOX"]);
    vi.mocked(getGoogleSession).mockResolvedValue({ userId: "gid-done", userEmail: "a@example.com", userName: null, accessToken: "tok", consented: true });
    vi.mocked(triageToday).mockImplementation(async (emails) => ({
      items: emails.map((e) => ({ id: e.id, bucket: "reply" as const, action: `Answer ${e.id}`, due: "", dueDate: "" })),
      verdicts: emails.map((e) => ({ id: e.id, isSpam: false, reason: "legitimate" as const })),
    }));
  });

  it("leaves the archived item out, counts what is left, and makes no new model call; Undo brings it back the same way", async () => {
    const first = await load();
    expect(first.briefing.map((i: { id: string }) => i.id)).toEqual(["m1", "m2"]);
    expect(triageToday).toHaveBeenCalledTimes(1);

    expect((await action("done", "m1")).status).toBe(200);
    const afterDone = await load();
    // The list was read from Gmail again (the archived message is no longer in the inbox)...
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(afterDone.count).toBe(1);
    expect(afterDone.briefing).toEqual([{ id: "m2", bucket: "reply", action: "Answer m2", due: "", dueDate: "" }]);
    // ...but the model wasn't asked again.
    expect(triageToday).toHaveBeenCalledTimes(1);

    expect((await action("undo_archive", "m1")).status).toBe(200);
    const afterUndo = await load();
    expect(afterUndo.briefing.map((i: { id: string }) => i.id)).toEqual(["m1", "m2"]);
    expect(afterUndo.briefing[0].action).toBe("Answer m1");
    expect(triageToday).toHaveBeenCalledTimes(1);
  });
});
