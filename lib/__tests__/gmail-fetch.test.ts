import { describe, it, expect, vi, beforeEach } from "vitest";

// The Gmail REST client is the external boundary: everything above it
// (pagination, metadata-only reads, retries, auth-error mapping) is real.
const api = {
  list: vi.fn(),
  get: vi.fn(),
  trash: vi.fn(),
  untrash: vi.fn(),
  modify: vi.fn(),
};
const gmailFactory = vi.fn<(options: unknown) => unknown>(() => ({ users: { messages: api } }));
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    gmail: (options: unknown) => gmailFactory(options),
  },
}));

import {
  archiveMessage,
  fetchRecentMessages,
  getUnsubscribeHeaders,
  GMAIL_CALL_TIMEOUT_MS,
  GmailAuthError,
  isGmailAuthError,
  MAX_MESSAGES,
  parseMessage,
  trashMessage,
  unarchiveMessage,
  untrashMessage,
} from "../gmail";

function httpError(status: number, message = `HTTP ${status}`): Error {
  return Object.assign(new Error(message), { status });
}

function metadata(id: string, extra: { labels?: string[]; headers?: Record<string, string> } = {}) {
  const headers = { From: `Sender ${id} <${id}@example.com>`, Subject: `Subject ${id}`, Date: "Thu, 24 Sep 2026 09:00:00 +0000", ...extra.headers };
  return {
    data: {
      id,
      threadId: `t-${id}`,
      snippet: `snippet ${id}`,
      labelIds: extra.labels ?? ["INBOX"],
      payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
    },
  };
}

function ids(prefix: string, n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));
}

describe("fetchRecentMessages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation(async ({ id }: { id: string }) => metadata(id));
  });

  it("reads the last 24 hours as metadata only, never message bodies", async () => {
    api.list.mockResolvedValue({ data: { messages: ids("m", 2), resultSizeEstimate: 2 } });
    const result = await fetchRecentMessages("tok");

    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "me", q: "newer_than:1d -in:sent -in:drafts -in:chats" }),
      { signal: expect.any(AbortSignal) }
    );
    for (const [args] of api.get.mock.calls) {
      expect(args.format).toBe("metadata");
      expect(args.metadataHeaders).toContain("List-Unsubscribe-Post");
    }
    expect(result).toMatchObject({ truncated: false, totalEstimate: 2 });
    expect(result.emails.map((e) => e.id)).toEqual(["m0", "m1"]);
    expect(result.emails[0]).toMatchObject({ threadId: "t-m0", from: "Sender m0 <m0@example.com>", isInInbox: true });
  });

  it("covers received mail only: Sent, Drafts and Chats never reach the summary, the rule groups or the count", async () => {
    // Even if the list returned them anyway, messages the user wrote are
    // dropped by their labels. A note to self (SENT + INBOX) is also left out.
    api.list.mockResolvedValue({ data: { messages: ids("m", 5), resultSizeEstimate: 5 } });
    const labels: Record<string, string[]> = {
      m0: ["INBOX", "UNREAD"],
      m1: ["SENT"],
      m2: ["DRAFT"],
      m3: ["CHAT"],
      m4: ["SENT", "INBOX"],
    };
    api.get.mockImplementation(async ({ id }: { id: string }) => metadata(id, { labels: labels[id] }));

    const result = await fetchRecentMessages("tok");

    expect(api.list.mock.calls[0][0].q).toMatch(/-in:sent/);
    expect(api.list.mock.calls[0][0].q).toMatch(/-in:drafts/);
    expect(result.emails.map((e) => e.id)).toEqual(["m0"]);

    const { ruleBasedGroups } = await import("../rules");
    const groups = ruleBasedGroups(result.emails);
    expect([...groups.toCheck, ...groups.bulk]).toEqual(["m0"]);
  });

  it("keeps received mail the user already archived (no INBOX label)", async () => {
    api.list.mockResolvedValue({ data: { messages: ids("m", 1), resultSizeEstimate: 1 } });
    api.get.mockImplementation(async ({ id }: { id: string }) => metadata(id, { labels: ["CATEGORY_UPDATES"] }));
    const result = await fetchRecentMessages("tok");
    expect(result.emails).toHaveLength(1);
    expect(result.emails[0].isInInbox).toBe(false);
  });

  it("follows nextPageToken until every message in the window is read", async () => {
    api.list
      .mockResolvedValueOnce({ data: { messages: ids("a", 40), nextPageToken: "p2", resultSizeEstimate: 70 } })
      .mockResolvedValueOnce({ data: { messages: ids("b", 30), resultSizeEstimate: 70 } });
    const result = await fetchRecentMessages("tok");

    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1][0].pageToken).toBe("p2");
    expect(result.emails).toHaveLength(70);
    expect(result.truncated).toBe(false);
  });

  it("stops at the limit and says the list was truncated", async () => {
    api.list.mockResolvedValueOnce({ data: { messages: ids("a", 100), nextPageToken: "more", resultSizeEstimate: 173 } });
    const result = await fetchRecentMessages("tok");

    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(MAX_MESSAGES);
    expect(result).toMatchObject({ truncated: true, totalEstimate: 173 });
    expect(result.emails).toHaveLength(MAX_MESSAGES);
  });

  it("handles an empty inbox", async () => {
    api.list.mockResolvedValue({ data: {} });
    expect(await fetchRecentMessages("tok")).toEqual({ emails: [], truncated: false, totalEstimate: 0 });
  });

  it("retries a transient Gmail failure (503) and succeeds", async () => {
    api.list.mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce({ data: { messages: ids("m", 1) } });
    api.get.mockRejectedValueOnce(httpError(429)).mockImplementation(async ({ id }: { id: string }) => metadata(id));
    const result = await fetchRecentMessages("tok");
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(result.emails).toHaveLength(1);
  });

  it("does not retry a revoked grant; it becomes a GmailAuthError", async () => {
    api.list.mockRejectedValue(httpError(401, "Invalid Credentials"));
    await expect(fetchRecentMessages("tok")).rejects.toBeInstanceOf(GmailAuthError);
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it("points at a stand-in Gmail API only when GMAIL_API_ROOT_URL is set", async () => {
    api.list.mockResolvedValue({ data: {} });
    await fetchRecentMessages("tok");
    expect(gmailFactory).toHaveBeenLastCalledWith(expect.not.objectContaining({ rootUrl: expect.anything() }));
    vi.stubEnv("GMAIL_API_ROOT_URL", "http://127.0.0.1:9999/");
    await fetchRecentMessages("tok");
    expect(gmailFactory).toHaveBeenLastCalledWith(expect.objectContaining({ rootUrl: "http://127.0.0.1:9999/" }));
    vi.unstubAllEnvs();
  });
});

describe("parseMessage", () => {
  it("fills in defaults for missing headers", () => {
    const email = parseMessage({ id: "x", payload: { headers: [] } });
    expect(email).toMatchObject({ threadId: "x", subject: "(no subject)", from: "", listUnsubscribe: null, isInInbox: false });
  });
});

describe("isGmailAuthError", () => {
  it.each([
    [httpError(401), true],
    [httpError(403, "Request had insufficient authentication scopes."), true],
    [httpError(403, "Rate Limit Exceeded"), false],
    [httpError(500), false],
  ])("%s -> %s", (err, expected) => {
    expect(isGmailAuthError(err)).toBe(expected);
  });
});

describe("single-message calls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the unsubscribe headers", async () => {
    api.get.mockResolvedValue(
      metadata("m1", { headers: { "List-Unsubscribe": "<https://x.example/u>", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } })
    );
    expect(await getUnsubscribeHeaders("tok", "m1")).toEqual({
      listUnsubscribe: "<https://x.example/u>",
      listUnsubscribePost: "List-Unsubscribe=One-Click",
    });
    api.get.mockResolvedValue({ data: { id: "m2" } });
    expect(await getUnsubscribeHeaders("tok", "m2")).toEqual({ listUnsubscribe: null, listUnsubscribePost: null });
  });

  it("trash, untrash, archive and unarchive send the right Gmail change", async () => {
    await trashMessage("tok", "m1");
    await untrashMessage("tok", "m1");
    await archiveMessage("tok", "m1");
    await unarchiveMessage("tok", "m1");
    const bounded = { signal: expect.any(AbortSignal) };
    expect(api.trash).toHaveBeenCalledWith({ userId: "me", id: "m1" }, bounded);
    expect(api.untrash).toHaveBeenCalledWith({ userId: "me", id: "m1" }, bounded);
    expect(api.modify).toHaveBeenNthCalledWith(1, { userId: "me", id: "m1", requestBody: { removeLabelIds: ["INBOX"] } }, bounded);
    expect(api.modify).toHaveBeenNthCalledWith(2, { userId: "me", id: "m1", requestBody: { addLabelIds: ["INBOX"] } }, bounded);
  });

  it("a change Gmail never answers fails after the per-call timeout, without a retry", async () => {
    vi.useFakeTimers();
    try {
      api.trash.mockImplementation(() => new Promise(() => {}));
      const pending = trashMessage("tok", "m1");
      const assertion = expect(pending).rejects.toThrow(/Timed out/);
      await vi.advanceTimersByTimeAsync(GMAIL_CALL_TIMEOUT_MS);
      await assertion;
      expect(api.trash).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("changes are never retried, and an auth failure asks for reconnect", async () => {
    api.trash.mockRejectedValueOnce(httpError(503));
    await expect(trashMessage("tok", "m1")).rejects.toThrow("HTTP 503");
    expect(api.trash).toHaveBeenCalledTimes(1);
    api.modify.mockRejectedValueOnce(httpError(401));
    await expect(archiveMessage("tok", "m1")).rejects.toBeInstanceOf(GmailAuthError);
  });
});
