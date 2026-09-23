import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/gmail", () => ({
  trashMessage: vi.fn(),
  archiveMessage: vi.fn(),
  getListUnsubscribeHeader: vi.fn(),
}));
vi.mock("@/lib/safe-fetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/safe-fetch")>();
  return { ...actual, safeFetchUnsubscribe: vi.fn() };
});
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));

import { auth } from "@/auth";
import { trashMessage, archiveMessage, getListUnsubscribeHeader } from "@/lib/gmail";
import { safeFetchUnsubscribe, UnsafeUrlError } from "@/lib/safe-fetch";
import { logAuditEvent } from "@/lib/audit";
import { POST } from "./route";

function postRequest(body: unknown) {
  return new Request("http://localhost/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));
    expect(res.status).toBe(401);
  });

  it("delete: trashes the message and logs it", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);

    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(trashMessage).toHaveBeenCalledWith("tok", "m1");
    expect(logAuditEvent).toHaveBeenCalledWith({ userEmail: "a@example.com", action: "delete", messageId: "m1" });
  });

  it("delete: returns 502 and does not log success when Gmail trash fails", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);
    vi.mocked(trashMessage).mockRejectedValue(new Error("Gmail down"));

    const res = await POST(postRequest({ action: "delete", messageId: "m1" }));

    expect(res.status).toBe(502);
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it("ignore: logs without calling any Gmail mutation", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);

    const res = await POST(postRequest({ action: "ignore", messageId: "m1" }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(trashMessage).not.toHaveBeenCalled();
    expect(archiveMessage).not.toHaveBeenCalled();
    expect(logAuditEvent).toHaveBeenCalledWith({ userEmail: "a@example.com", action: "ignore", messageId: "m1" });
  });

  it("unsubscribe: no List-Unsubscribe header -> 400, logged as failed", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);
    vi.mocked(getListUnsubscribeHeader).mockResolvedValue(null);

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ detail: "failed: no List-Unsubscribe header" })
    );
  });

  it("unsubscribe: mailto-only header -> 400, no automatic link", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);
    vi.mocked(getListUnsubscribeHeader).mockResolvedValue("<mailto:unsub@example.com>");

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));

    expect(res.status).toBe(400);
    expect(safeFetchUnsubscribe).not.toHaveBeenCalled();
  });

  it("unsubscribe: unsafe URL is blocked by safe-fetch and reported to the user", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);
    vi.mocked(getListUnsubscribeHeader).mockResolvedValue("<https://example.com/unsub>");
    vi.mocked(safeFetchUnsubscribe).mockRejectedValue(new UnsafeUrlError("blocked"));

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/isn't allowed/i);
    expect(archiveMessage).not.toHaveBeenCalled();
  });

  it("unsubscribe: success -> fetches, archives, and logs succeeded", async () => {
    vi.mocked(auth).mockResolvedValue({ accessToken: "tok", user: { email: "a@example.com" } } as never);
    vi.mocked(getListUnsubscribeHeader).mockResolvedValue("<https://example.com/unsub>");
    vi.mocked(safeFetchUnsubscribe).mockResolvedValue(new Response("ok", { status: 200 }));

    const res = await POST(postRequest({ action: "unsubscribe", messageId: "m1" }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(archiveMessage).toHaveBeenCalledWith("tok", "m1");
    expect(logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "unsubscribe", detail: "succeeded" })
    );
  });
});
