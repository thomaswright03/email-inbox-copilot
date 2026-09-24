import { NextResponse } from "next/server";
import { aiEnabled, summarizeToday, SUMMARY_LANGUAGES, type SummaryLanguage } from "@/lib/ai";
import { ruleBasedGroups } from "@/lib/rules";
import type { AiStatus, TodayPayload } from "@/lib/payloads";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceRateLimit, RATE_LIMITS, RateLimitError, reserveAiCalls } from "@/lib/rate-limit";
import { isQuotaError, logError, logSecurityEvent } from "@/lib/log";
import { INBOX_CACHE_TTL_MS, maybeRefresh, readInbox } from "@/lib/inbox";

function languageFrom(req: Request): SummaryLanguage {
  const lang = new URL(req.url).searchParams.get("lang");
  return lang && lang in SUMMARY_LANGUAGES ? (lang as SummaryLanguage) : "en";
}

async function buildTodayPayload(accessToken: string, userId: string, language: SummaryLanguage): Promise<TodayPayload> {
  const inbox = await readInbox(accessToken, userId, "today");
  const { emails } = inbox;

  let summary: string | null = null;
  let aiStatus: AiStatus = aiEnabled() ? "generated" : "off";
  let aiResetsAt: string | undefined;
  if (aiStatus === "generated" && emails.length > 0) {
    const grant = await reserveAiCalls(userId, 1);
    if (grant.granted === 0) {
      // Over today's AI budget (or it can't be checked): the rule-based
      // view, and the user is told when AI summaries come back.
      aiStatus = grant.limitedBy === "budget" ? "budget" : "unavailable";
      if (aiStatus === "budget") aiResetsAt = grant.resetsAt;
    } else {
      try {
        summary = await summarizeToday(emails, language);
        if (!summary) aiStatus = "unavailable";
      } catch (err) {
        // Any AI failure degrades to the rule-based view instead of failing the page.
        aiStatus = "unavailable";
        logError("today.gemini", err);
        if (isQuotaError(err)) logSecurityEvent("ai_quota_exhausted", { route: "today" });
      }
    }
  }

  return {
    aiStatus,
    ...(aiResetsAt ? { aiResetsAt } : {}),
    summary,
    groups: summary ? null : ruleBasedGroups(emails),
    generatedAt: new Date().toISOString(),
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
  try {
    await enforceRateLimit(RATE_LIMITS.inboxReads, session.userId);
    await maybeRefresh(req, session.userId, "today");
    const payload = await getOrSetCached(
      userCacheKey("today", session.userId, undefined, language),
      INBOX_CACHE_TTL_MS,
      () => buildTodayPayload(session.accessToken, session.userId, language)
    );
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitedResponse(err);
    if (err instanceof RouteError) return jsonError(err.message, err.status, undefined, err.code);
    throw err;
  }
}
