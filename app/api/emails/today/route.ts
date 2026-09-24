import { NextResponse } from "next/server";
import { fetchTodaysMessages } from "@/lib/gmail";
import { summarizeToday } from "@/lib/ai";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceAiBudget, enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { logError } from "@/lib/log";

const CACHE_TTL_MS = 5 * 60 * 1000;

async function buildTodayPayload(accessToken: string, userId: string) {
  let emails;
  try {
    emails = await fetchTodaysMessages(accessToken);
  } catch (err) {
    logError("today.gmail", err);
    throw new RouteError("Couldn't reach Gmail right now. Try again in a moment.", 502);
  }

  let summary: string;
  try {
    if (emails.length > 0) await enforceAiBudget(userId);
    summary = await summarizeToday(emails);
  } catch (err) {
    if (err instanceof RateLimitError) throw err;
    logError("today.gemini", err);
    throw new RouteError("Couldn't generate your summary right now. Try again in a moment.", 502);
  }

  return {
    summary,
    count: emails.length,
    emails: emails.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      date: e.date,
    })),
  };
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    await enforceRateLimit(RATE_LIMITS.inboxReads, session.userId);
    const payload = await getOrSetCached(userCacheKey("today", session.userId), CACHE_TTL_MS, () =>
      buildTodayPayload(session.accessToken, session.userId)
    );
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitedResponse(err);
    if (err instanceof RouteError) return jsonError(err.message, err.status);
    throw err;
  }
}
