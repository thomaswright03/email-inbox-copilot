import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("@/lib/gmail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/gmail")>();
  return {
    GmailAuthError: actual.GmailAuthError,
    GmailNotFoundError: actual.GmailNotFoundError,
    trashMessage: vi.fn(),
    untrashMessage: vi.fn(),
    archiveMessage: vi.fn(),
    unarchiveMessage: vi.fn(),
    getUnsubscribeHeaders: vi.fn(),
  };
});
vi.mock("@/lib/safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/safe-fetch")>();
  return { ...actual, oneClickUnsubscribe: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

import { getGoogleSession } from "@/lib/session";
import {
  archiveMessage,
  getUnsubscribeHeaders,
  GmailAuthError,
  GmailNotFoundError,
  trashMessage,
  unarchiveMessage,
  untrashMessage,
} from "@/lib/gmail";
import { oneClickUnsubscribe, UnsafeUrlError } from "@/lib/safe-fetch";
import { ignoredMessageIds } from "@/lib/ignored";
import { logAuditEvent } from "@/lib/audit";
import { POST } from "./route";

function sessionFor(email: string) {
  return { userId: `gid-${email}`, userEmail: email, userName: null, accessToken: "tok", consented: true };
}

const ONE_CLICK = {
  listUnsubscribe: "<https://example.com/unsub>",
  listUnsubscribePost: "List-Unsubscribe=One-Click",
};

function postRequest(body: unknown) {
  return new Request("http://localhost/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/actions", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);
    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));
    expect(res.status).toBe(401);
  });

  it("delete: trashes the message and logs it", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));

    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(trashMessage).toHaveBeenCalledWith("tok", "m1");
    expect(logAuditEvent).toHaveBeenCalledWith({ userId: "gid-a@example.com", action: "delete", messageId: "m1" });
  });

  it("delete: returns 502 and does not log success when Gmail trash fails", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(trashMessage).mockRejectedValue(new Error("Gmail down"));

    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));

    expect(res.status).toBe(502);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("delete: a revoked Gmail grant asks the user to reconnect", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(trashMessage).mockRejectedValue(new GmailAuthError());

    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("gmail_reconnect");
  });

  it("delete: a message already deleted in Gmail (404) says so with its own code, not 'try again'", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(trashMessage).mockRejectedValue(new GmailNotFoundError());

    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));

    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ ok: false, code: "message_gone", error: "This email is no longer in your inbox." });
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("unsubscribe: a message that is gone before its headers are read is reported the same way", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockRejectedValue(new GmailNotFoundError());

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));

    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("message_gone");
    expect(oneClickUnsubscribe).not.toHaveBeenCalled();
  });

  it("unsubscribe: a message deleted between the unsubscribe and the archive counts as out of the inbox", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(ONE_CLICK);
    vi.mocked(oneClickUnsubscribe).mockResolvedValue({ status: 200, location: null });
    vi.mocked(archiveMessage).mockRejectedValue(new GmailNotFoundError());

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));

    expect(await res.json()).toEqual({ ok: true, archived: true });
  });

  it("ignore: remembers the choice without calling any Gmail mutation", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("ig@example.com"));

    const res = await POST(postRequest({ action: "ignore", messageId: "m1" }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(trashMessage).not.toHaveBeenCalled();
    expect(archiveMessage).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith({ userId: "gid-ig@example.com", action: "ignore", messageId: "m1" });
    expect(await ignoredMessageIds("gid-ig@example.com")).toEqual(new Set(["m1"]));
  });

  it("undo_ignore: forgets the Not spam choice", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("ui@example.com"));
    await POST(postRequest({ action: "ignore", messageId: "m2" }));

    const res = await POST(postRequest({ action: "undo_ignore", messageId: "m2" }));

    expect(res.status).toBe(200);
    expect(await ignoredMessageIds("gid-ui@example.com")).toEqual(new Set());
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "undo", detail: "not spam" }));
  });

  it("undo_delete: restores the message from the trash", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));

    const res = await POST(postRequest({ action: "undo_delete", messageId: "m1" }));

    expect(res.status).toBe(200);
    expect(untrashMessage).toHaveBeenCalledWith("tok", "m1");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "undo", detail: "restored from trash" }));
  });

  it("done: archives the message (removes it from the inbox) and logs it", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));

    const res = await POST(postRequest({ action: "done", messageId: "m1" }));

    expect(res.status).toBe(200);
    expect(archiveMessage).toHaveBeenCalledWith("tok", "m1");
    expect(trashMessage).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith({ userId: "gid-a@example.com", action: "done", messageId: "m1" });
  });

  it("done: a message already deleted in Gmail says so with its own code", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(archiveMessage).mockRejectedValue(new GmailNotFoundError());

    const res = await POST(postRequest({ action: "done", messageId: "m1" }));

    expect(res.status).toBe(410);
    expect((await res.json()).code).toBe("message_gone");
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("snooze: changes nothing in Gmail and only records that it was used", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));

    const res = await POST(postRequest({ action: "snooze", messageId: "m1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    for (const change of [archiveMessage, unarchiveMessage, trashMessage, untrashMessage, getUnsubscribeHeaders]) {
      expect(change).not.toHaveBeenCalled();
    }
    // Only that Snooze was used: not which message (Privacy Policy section 3).
    expect(logAuditEvent).toHaveBeenCalledWith({
      userId: "gid-a@example.com",
      action: "snooze",
      detail: "hidden in Inbox Buddy only",
    });
  });

  it("snooze: takes nothing but the message id", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await POST(postRequest({ action: "snooze", messageId: "m1", until: "2026-09-25T09:00:00Z" }));

    expect(res.status).toBe(400);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("undo_archive: moves the message back to the inbox", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));

    const res = await POST(postRequest({ action: "undo_archive", messageId: "m1" }));

    expect(res.status).toBe(200);
    expect(unarchiveMessage).toHaveBeenCalledWith("tok", "m1");
  });

  it("unsubscribe: no List-Unsubscribe header -> 400, logged as failed", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue({ listUnsubscribe: null, listUnsubscribePost: null });

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({ ok: false, code: "no_unsubscribe" });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: "failed: no one-click unsubscribe" }));
  });

  it.each([
    ["mailto only", { listUnsubscribe: "<mailto:unsub@example.com>", listUnsubscribePost: null }],
    ["https link without one-click", { listUnsubscribe: "<https://example.com/unsub>", listUnsubscribePost: null }],
  ])("unsubscribe: %s -> 400, the server never requests the link", async (_, headers) => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(headers);

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));

    expect(res.status).toBe(400);
    expect(oneClickUnsubscribe).not.toHaveBeenCalled();
    expect(archiveMessage).not.toHaveBeenCalled();
  });

  it("unsubscribe: unsafe URL is blocked by safe-fetch and reported to the user", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(ONE_CLICK);
    vi.mocked(oneClickUnsubscribe).mockRejectedValue(new UnsafeUrlError("blocked"));

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("unsubscribe_unsafe");
    expect(body.error).toMatch(/isn't allowed/i);
    expect(archiveMessage).not.toHaveBeenCalled();
  });

  it.each([404, 500, 302])("unsubscribe: sender answers HTTP %i -> not reported as success", async (status) => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(ONE_CLICK);
    vi.mocked(oneClickUnsubscribe).mockResolvedValue({ status, location: null });

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body).toMatchObject({ ok: false, code: "unsubscribe_rejected" });
    expect(archiveMessage).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "unsubscribe", detail: `failed: sender answered HTTP ${status}` })
    );
  });

  it("unsubscribe: a network error -> 502 unsubscribe_failed", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(ONE_CLICK);
    vi.mocked(oneClickUnsubscribe).mockRejectedValue(new Error("ECONNRESET"));

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));

    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("unsubscribe_failed");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: "failed: request error" }));
  });

  it("unsubscribe: success -> one-click POST, archives, and logs succeeded", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(ONE_CLICK);
    vi.mocked(oneClickUnsubscribe).mockResolvedValue({ status: 200, location: null });

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(body).toEqual({ ok: true, archived: true });
    expect(oneClickUnsubscribe).toHaveBeenCalledWith("https://example.com/unsub");
    expect(archiveMessage).toHaveBeenCalledWith("tok", "m1");
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "unsubscribe", detail: "succeeded" }));
  });

  it("unsubscribe: succeeded but archive failed -> says so instead of claiming it was archived", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("a@example.com"));
    vi.mocked(getUnsubscribeHeaders).mockResolvedValue(ONE_CLICK);
    vi.mocked(oneClickUnsubscribe).mockResolvedValue({ status: 202, location: null });
    vi.mocked(archiveMessage).mockRejectedValue(new Error("Gmail down"));

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(body).toEqual({ ok: true, archived: false, warning: "archive_failed" });
    expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ detail: "succeeded, archive failed" }));
  });

  it("rejects a cross-site request before touching the session or Gmail", async () => {
    const req = new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://evil.example" },
      body: JSON.stringify({ action: "delete", messageId: "m1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect(getGoogleSession).not.toHaveBeenCalled();
    expect(trashMessage).not.toHaveBeenCalled();
  });

  it("rejects a request with neither Origin nor a same-origin Sec-Fetch-Site", async () => {
    const req = new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", messageId: "m1" }),
    });
    expect((await POST(req)).status).toBe(403);
  });

  it("returns 403 when the user hasn't accepted the current terms", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue({ ...sessionFor("c@example.com"), consented: false });
    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));
    expect(res.status).toBe(403);
    expect(trashMessage).not.toHaveBeenCalled();
  });

  it.each([
    [{ action: "delete", messageId: "../../users/other" }],
    [{ action: "delete", messageId: "" }],
    [{ action: "delete", messageId: 123 }],
    [{ action: "nuke", messageId: "m1" }],
    [{ action: "delete", messageId: "m1", extra: true }],
    ["not an object"],
  ])("rejects malformed input %j with 400", async (body) => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("v@example.com"));
    const res = await POST(postRequest(body));
    expect(res.status).toBe(400);
    expect(trashMessage).not.toHaveBeenCalled();
  });

  it("returns 400 for a body that isn't JSON", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("v@example.com"));
    const req = new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: "{not json",
    });
    expect((await POST(req)).status).toBe(400);
  });

  it("rate-limits a user who fires too many actions", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("burst@example.com"));
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      statuses.push((await POST(postRequest({ action: "ignore", messageId: `m${i}` }))).status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(30);
    expect(statuses.at(-1)).toBe(429);
  });

  it("returns 415 for a non-JSON content type (form/text-plain CSRF shape)", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("v@example.com"));
    const req = new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: "http://localhost" },
      body: JSON.stringify({ action: "delete", messageId: "m1" }),
    });
    expect((await POST(req)).status).toBe(415);
    expect(trashMessage).not.toHaveBeenCalled();
  });

  it("stops reading a chunked body without Content-Length once it passes 1 KB", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(sessionFor("v@example.com"));
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(512).fill(32));
        if (pulled > 1000) controller.close();
      },
    });
    const req = new Request("http://localhost/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body,
      duplex: "half",
    } as RequestInit);
    expect((await POST(req)).status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });
});
