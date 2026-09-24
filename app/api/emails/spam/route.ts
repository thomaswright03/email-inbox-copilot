import { NextResponse } from "next/server";
import { fetchTodaysMessages } from "@/lib/gmail";
import { classifySpam, spamCandidates } from "@/lib/ai";
import { logAuditEvent } from "@/lib/audit";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceAiBudget, enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildSpamPayload(accessToken: string, userId: string, userEmail: string) {
  let emails;
  try {
    emails = await fetchTodaysMessages(accessToken);
  } catch (err) {
    logError("spam.gmail", err);
    throw new RouteError("Couldn't reach Gmail right now. Try again in a moment.", 502);
  }

  let verdicts;
  try {
    if (spamCandidates(emails).length > 0) await enforceAiBudget(userId);
    verdicts = await classifySpam(emails);
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    logError("spam.gemini", err);
    throw new RouteError("Couldn't check for spam right now. Try again in a moment.", 502);
  }

  const spamIds = new Set(verdicts.filter((v) => v.isSpam).map((v) => v.id));

  const flashcards = emails
    .filter((e) => spamIds.has(e.id))
    .map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      hasUnsubscribe: Boolean(e.listUnsubscribe),
      reason: verdicts.find((v) => v.id === e.id)?.reason ?? "",
    }));

  // Only logged when this actually ran (a true cache miss) — logging inside
  // getOrSetCached's fetcher, not after it returns, avoids writing duplicate
  // classification rows every time a cached response is served.
  await Promise.all(
    flashcards.map((card) =>
      logAuditEvent({ userEmail, action: "classified_spam", messageId: card.id, detail: card.reason })
    )
  );

  return { flashcards };
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    await enforceRateLimit(RATE_LIMITS.inboxReads, session.userId);
    const payload = await getOrSetCached(userCacheKey("spam", session.userId), CACHE_TTL_MS, () =>
      buildSpamPayload(session.accessToken, session.userId, session.userEmail)
    );
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitedResponse(err);
    if (err instanceof RouteError) return jsonError(err.message, err.status);
    throw err;
  }
}
