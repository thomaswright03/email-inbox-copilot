import { NextResponse } from "next/server";
import { aiEnabled, languageFrom, type BriefingItem, type SummaryLanguage } from "@/lib/ai";
import { ruleBasedGroups } from "@/lib/rules";
import type { AiStatus, TodayPayload } from "@/lib/payloads";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { INBOX_CACHE_TTL_MS, maybeRefresh, readInbox } from "@/lib/inbox";
import { localDayFrom, type LocalDay } from "@/lib/local-day";
import { briefingFor, triageInbox } from "@/lib/triage";

async function buildTodayPayload(accessToken: string, userId: string, day: LocalDay, language: SummaryLanguage): Promise<TodayPayload> {
  const inbox = await readInbox(accessToken, userId, day, "today");
  const { emails } = inbox;

  let briefing: BriefingItem[] | null = null;
  let aiStatus: AiStatus = aiEnabled() ? "generated" : "off";
  let aiResetsAt: string | undefined;
  if (aiStatus === "generated" && emails.length > 0) {
    // The same call (and cached answer) the spam route uses.
    const triage = await triageInbox(userId, day, language, emails);
    aiStatus = triage.aiStatus;
    if (triage.aiStatus === "generated") briefing = briefingFor(emails, triage.items);
    if (triage.aiStatus === "budget") aiResetsAt = triage.aiResetsAt;
  }

  return {
    aiStatus,
    ...(aiResetsAt ? { aiResetsAt } : {}),
    briefing,
    groups: briefing ? null : ruleBasedGroups(emails),
    generatedAt: new Date().toISOString(),
    localDate: day.date,
    count: emails.length,
    truncated: inbox.truncated,
    totalEstimate: inbox.totalEstimate,
    emails: emails.map((e) => ({ id: e.id, threadId: e.threadId, from: e.from, subject: e.subject, date: e.date })),
  };
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const language = languageFrom(req);
  const day = localDayFrom(req);
  try {
    await enforceRateLimit(RATE_LIMITS.inboxReads, session.userId);
    await maybeRefresh(req, session.userId, day, "today");
    const payload = await getOrSetCached(
      userCacheKey("today", session.userId, day, language),
      INBOX_CACHE_TTL_MS,
      () => buildTodayPayload(session.accessToken, session.userId, day, language)
    );
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitedResponse(err);
    if (err instanceof RouteError) return jsonError(err.message, err.status, undefined, err.code);
    throw err;
  }
}
