import { NextResponse } from "next/server";
import { z } from "zod";
import { trashMessage, archiveMessage, getListUnsubscribeHeader } from "@/lib/gmail";
import { safeFetchUnsubscribe, UnsafeUrlError } from "@/lib/safe-fetch";
import { parseUnsubscribeTargets } from "@/lib/unsubscribe";
import { logAuditEvent } from "@/lib/audit";
import { invalidateCachedEverywhere, userCacheKey } from "@/lib/response-cache";
import { jsonError, rateLimitedResponse, readBodyCapped, rejectCrossSite, requireSession } from "@/lib/api";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { logError, logSecurityEvent } from "@/lib/log";

// Gmail message ids are short opaque [A-Za-z0-9] strings; anything else is
// rejected before it reaches Gmail, the audit log, or a cache key.
const ActionBodySchema = z
  .object({
    action: z.enum(["delete", "unsubscribe", "ignore"]),
    messageId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  })
  .strict();

const MAX_BODY_BYTES = 1024;

async function invalidateEmailCaches(userId: string) {
  await Promise.all([
    invalidateCachedEverywhere(userCacheKey("today", userId)),
    invalidateCachedEverywhere(userCacheKey("spam", userId)),
  ]);
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

  if (action === "ignore") {
    await logAuditEvent({ userId, action: "ignore", messageId });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete") {
    try {
      await trashMessage(accessToken, messageId);
    } catch (err) {
      logError("actions.delete", err);
      return NextResponse.json({ ok: false, error: "Couldn't delete this email right now" }, { status: 502 });
    }
    await logAuditEvent({ userId, action: "delete", messageId });
    await invalidateEmailCaches(userId);
    return NextResponse.json({ ok: true });
  }

  // action === "unsubscribe"
  let header: string | null;
  try {
    header = await getListUnsubscribeHeader(accessToken, messageId);
  } catch (err) {
    logError("actions.unsubscribe.header", err);
    return NextResponse.json({ ok: false, error: "Couldn't look up unsubscribe info right now" }, { status: 502 });
  }
  if (!header) {
    await logAuditEvent({
      userId,
      action: "unsubscribe",
      messageId,
      detail: "failed: no List-Unsubscribe header",
    });
    return NextResponse.json({ ok: false, error: "No unsubscribe method found for this message" }, { status: 400 });
  }

  const { url } = parseUnsubscribeTargets(header);
  if (!url) {
    await logAuditEvent({
      userId,
      action: "unsubscribe",
      messageId,
      detail: "failed: mailto-only, no automatic link",
    });
    return NextResponse.json({
      ok: false,
      error: "This sender only supports unsubscribing via email; no automatic link available",
    }, { status: 400 });
  }

  try {
    await safeFetchUnsubscribe(url);
  } catch (err) {
    const unsafe = err instanceof UnsafeUrlError;
    const detail = unsafe ? "failed: unsafe unsubscribe URL blocked" : "failed: request error";
    await logAuditEvent({ userId, action: "unsubscribe", messageId, detail });
    if (unsafe) {
      logSecurityEvent("ssrf_blocked", { route: "actions" });
      return NextResponse.json({ ok: false, error: "This unsubscribe link isn't allowed" }, { status: 400 });
    }
    logError("actions.unsubscribe.fetch", err);
    return NextResponse.json({ ok: false, error: "Unsubscribe request failed" }, { status: 502 });
  }

  try {
    await archiveMessage(accessToken, messageId);
  } catch (err) {
    logError("actions.unsubscribe.archive", err);
    await logAuditEvent({ userId, action: "unsubscribe", messageId, detail: "succeeded, archive failed" });
    await invalidateEmailCaches(userId);
    return NextResponse.json({ ok: true, warning: "Unsubscribed, but couldn't archive the message" });
  }
  await logAuditEvent({ userId, action: "unsubscribe", messageId, detail: "succeeded" });
  await invalidateEmailCaches(userId);
  return NextResponse.json({ ok: true });
}
