import { NextResponse } from "next/server";
import { z } from "zod";
import {
  archiveMessage,
  getUnsubscribeHeaders,
  GmailAuthError,
  trashMessage,
  unarchiveMessage,
  untrashMessage,
} from "@/lib/gmail";
import { oneClickUnsubscribe, UnsafeUrlError } from "@/lib/safe-fetch";
import { unsubscribeMethod } from "@/lib/unsubscribe";
import { logAuditEvent } from "@/lib/audit";
import { markIgnored, unmarkIgnored } from "@/lib/ignored";
import { invalidateUserInbox } from "@/lib/response-cache";
import { jsonError, rateLimitedResponse, readBodyCapped, rejectCrossSite, requireSession } from "@/lib/api";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { logError, logSecurityEvent } from "@/lib/log";

// Gmail message ids are short opaque [A-Za-z0-9] strings; anything else is
// rejected before it reaches Gmail, the audit log, or a cache key.
const ActionBodySchema = z
  .object({
    action: z.enum(["delete", "unsubscribe", "ignore", "undo_delete", "undo_archive", "undo_ignore"]),
    messageId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();

const MAX_BODY_BYTES = 1024;

function reconnect(): NextResponse {
  return jsonError("Inbox Buddy has lost access to your Gmail. Reconnect to continue.", 403, undefined, "gmail_reconnect");
}

// Runs one Gmail change; returns the error response to send, or null.
async function gmailChange(context: string, fn: () => Promise<void>, failure: string): Promise<NextResponse | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof GmailAuthError) return reconnect();
    logError(context, err);
    return jsonError(failure, 502, undefined, "action_failed");
  }
}

export async function POST(req: Request) {
  const crossSite = rejectCrossSite(req, "actions");
  if (crossSite) return crossSite;

  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    await enforceRateLimit(RATE_LIMITS.actions, session.userId);
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitedResponse(err);
    throw err;
  }

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return jsonError("Content-Type must be application/json", 415);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return jsonError("Request too large", 413);
  const raw = await readBodyCapped(req, MAX_BODY_BYTES);
  if (raw === null) return jsonError("Request too large", 413);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return jsonError("Invalid request", 400);
  }
  const parsed = ActionBodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    logSecurityEvent("invalid_input", { route: "actions" });
    return jsonError("Invalid request", 400);
  }

  const { action, messageId } = parsed.data;
  const { userId, accessToken } = session;

  if (action === "ignore" || action === "undo_ignore") {
    try {
      if (action === "ignore") await markIgnored(userId, messageId);
      else await unmarkIgnored(userId, messageId);
    } catch (err) {
      logError(`actions.${action}`, err);
      return jsonError("Couldn't save that right now. Try again in a moment.", 502, undefined, "action_failed");
    }
    await logAuditEvent({ userId, action: action === "ignore" ? "ignore" : "undo", messageId, detail: action === "undo_ignore" ? "not spam" : undefined });
    await invalidateUserInbox(userId, ["spam"]);
    return NextResponse.json({ ok: true });
  }

  if (action === "delete" || action === "undo_delete" || action === "undo_archive") {
    const change =
      action === "delete"
        ? () => trashMessage(accessToken, messageId)
        : action === "undo_delete"
          ? () => untrashMessage(accessToken, messageId)
          : () => unarchiveMessage(accessToken, messageId);
    const failed = await gmailChange(`actions.${action}`, change, "Couldn't change this email in Gmail right now. Try again in a moment.");
    if (failed) return failed;
    await logAuditEvent(
      action === "delete"
        ? { userId, action: "delete", messageId }
        : { userId, action: "undo", messageId, detail: action === "undo_delete" ? "restored from trash" : "moved back to inbox" }
    );
    await invalidateUserInbox(userId);
    return NextResponse.json({ ok: true });
  }

  // action === "unsubscribe": only senders that support RFC 8058 one-click
  // are unsubscribed by the server. For the others the dashboard opens the
  // sender's page or a prefilled email, because a server-side GET to a
  // confirmation page would unsubscribe nobody.
  let headers;
  try {
    headers = await getUnsubscribeHeaders(accessToken, messageId);
  } catch (err) {
    if (err instanceof GmailAuthError) return reconnect();
    logError("actions.unsubscribe.header", err);
    return jsonError("Couldn't look up unsubscribe info right now. Try again in a moment.", 502, undefined, "action_failed");
  }
  const method = unsubscribeMethod(headers.listUnsubscribe, headers.listUnsubscribePost);
  if (method?.kind !== "one-click") {
    await logAuditEvent({ userId, action: "unsubscribe", messageId, detail: "failed: no one-click unsubscribe" });
    return jsonError("This sender doesn't support one-click unsubscribe.", 400, undefined, "no_unsubscribe");
  }

  let status: number;
  try {
    ({ status } = await oneClickUnsubscribe(method.url));
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      await logAuditEvent({ userId, action: "unsubscribe", messageId, detail: "failed: unsafe unsubscribe URL blocked" });
      logSecurityEvent("ssrf_blocked", { route: "actions" });
      return jsonError("This sender's unsubscribe link isn't allowed.", 400, undefined, "unsubscribe_unsafe");
    }
    logError("actions.unsubscribe.fetch", err);
    await logAuditEvent({ userId, action: "unsubscribe", messageId, detail: "failed: request error" });
    return jsonError("Couldn't reach the sender to unsubscribe. Try again later.", 502, undefined, "unsubscribe_failed");
  }
  if (status < 200 || status > 299) {
    await logAuditEvent({ userId, action: "unsubscribe", messageId, detail: `failed: sender answered HTTP ${status}` });
    return jsonError(
      `The sender didn't accept the unsubscribe request (HTTP ${status}). You are still subscribed.`,
      502,
      undefined,
      "unsubscribe_rejected"
    );
  }

  const archiveFailed = await gmailChange("actions.unsubscribe.archive", () => archiveMessage(accessToken, messageId), "");
  await logAuditEvent({
    userId,
    action: "unsubscribe",
    messageId,
    detail: archiveFailed ? "succeeded, archive failed" : "succeeded",
  });
  await invalidateUserInbox(userId);
  return NextResponse.json(archiveFailed ? { ok: true, archived: false, warning: "archive_failed" } : { ok: true, archived: true });
}
