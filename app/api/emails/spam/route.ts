import { NextResponse } from "next/server";
import { aiEnabled, classifySpam, spamCandidates } from "@/lib/ai";
import { ruleBasedSpamVerdicts } from "@/lib/rules";
import { logAuditEvent } from "@/lib/audit";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceAiBudget, enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { isQuotaError, logError, logSecurityEvent } from "@/lib/log";
import { INBOX_CACHE_TTL_MS, maybeRefresh, readInbox } from "@/lib/inbox";
import { ignoredMessageIds } from "@/lib/ignored";
import { gmailComposeUrl, unsubscribeMethod } from "@/lib/unsubscribe";
import type { AiStatus, CardUnsubscribe, SpamPayload } from "@/lib/payloads";
import type { SpamVerdict } from "@/lib/ai";
import type { ParsedEmail } from "@/lib/gmail";

function cardUnsubscribe(e: ParsedEmail): CardUnsubscribe {
  const method = unsubscribeMethod(e.listUnsubscribe, e.listUnsubscribePost);
  if (!method) return null;
  if (method.kind === "one-click") return { kind: "one-click" };
  if (method.kind === "link") return { kind: "link", url: method.url };
  return { kind: "mailto", composeUrl: gmailComposeUrl(method.to, method.subject, method.body) };
}

async function buildSpamPayload(accessToken: string, userId: string): Promise<SpamPayload> {
  const { emails } = await readInbox(accessToken, userId, "spam");

  let aiStatus: AiStatus = aiEnabled() ? "generated" : "off";
  let verdicts: SpamVerdict[] | null = null;
  if (aiStatus === "generated") {
    try {
      await enforceAiBudget(userId, spamCandidates(emails).length);
      verdicts = await classifySpam(emails);
    } catch (err) {
      // Any AI failure, the daily AI budget included, degrades to the
      // rule-based flags instead of failing the page.
      aiStatus = "unavailable";
      if (!(err instanceof RateLimitError)) {
        logError("spam.gemini", err);
        if (isQuotaError(err)) logSecurityEvent("ai_quota_exhausted", { route: "spam" });
      }
    }
  }
  verdicts ??= ruleBasedSpamVerdicts(emails);

  const reasons = new Map(verdicts.filter((v) => v.isSpam).map((v) => [v.id, v.reason]));
  const flashcards = emails
    .filter((e) => reasons.has(e.id))
    .map((e) => ({
      id: e.id,
      threadId: e.threadId,
      from: e.from,
      subject: e.subject,
      snippet: e.snippet,
      reason: reasons.get(e.id)!,
      unsubscribe: cardUnsubscribe(e),
    }));

  // Only logged when this actually ran (a true cache miss) — logging inside
  // getOrSetCached's fetcher, not after it returns, avoids writing duplicate
  // classification rows every time a cached response is served.
  await Promise.all(flashcards.map((card) => logAuditEvent({ userId, action: "classified_spam", messageId: card.id })));

  return { aiStatus, generatedAt: new Date().toISOString(), flashcards };
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  try {
    await enforceRateLimit(RATE_LIMITS.inboxReads, session.userId);
    await maybeRefresh(req, session.userId, "spam");
    const [payload, ignored] = await Promise.all([
      getOrSetCached(userCacheKey("spam", session.userId), INBOX_CACHE_TTL_MS, () =>
        buildSpamPayload(session.accessToken, session.userId)
      ),
      ignoredMessageIds(session.userId),
    ]);
    // Filtered on every response, cached or not, so a message marked Not
    // spam never comes back.
    return NextResponse.json({ ...payload, flashcards: payload.flashcards.filter((c) => !ignored.has(c.id)) });
  } catch (err) {
    if (err instanceof RateLimitError) return rateLimitedResponse(err);
    if (err instanceof RouteError) return jsonError(err.message, err.status, undefined, err.code);
    throw err;
  }
}
