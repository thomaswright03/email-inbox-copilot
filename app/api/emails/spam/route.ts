import { NextResponse } from "next/server";
import { aiEnabled, classifyCandidates, MAX_CLASSIFY_PER_LOAD, MODEL, spamCandidates } from "@/lib/ai";
import { ruleBasedSpamVerdicts } from "@/lib/rules";
import { logAuditEvent } from "@/lib/audit";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceRateLimit, RATE_LIMITS, RateLimitError, reserveAiCalls } from "@/lib/rate-limit";
import { cachedVerdicts, rememberVerdicts } from "@/lib/verdict-cache";
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

type AiVerdicts = {
  aiStatus: AiStatus;
  // null: use the rule-based flags instead.
  verdicts: SpamVerdict[] | null;
  unchecked: number;
  aiResetsAt?: string;
};

// Gemini verdicts for the heuristic candidates: cached ones are reused, and
// up to MAX_CLASSIFY_PER_LOAD new ones are checked within the AI budget.
// Only the calls actually made are charged; the rest are checked on a
// later load.
async function aiVerdicts(userId: string, emails: ParsedEmail[]): Promise<AiVerdicts> {
  const candidates = spamCandidates(emails);
  const known = await cachedVerdicts(userId, MODEL);
  const todo = candidates.filter((e) => !known.has(e.id));
  const wanted = todo.slice(0, MAX_CLASSIFY_PER_LOAD);

  const grant = await reserveAiCalls(userId, wanted.length);
  let checked = 0;
  const fresh: SpamVerdict[] = [];
  if (grant.granted > 0) {
    // Never rejects: a failed model call comes back as result.error.
    const result = await classifyCandidates(wanted.slice(0, grant.granted));
    await grant.release(grant.granted - result.attempted);
    const usable = new Map(result.verdicts.map((v) => [v.id, v]));
    // An unusable answer is remembered as "not spam", so it isn't paid for again.
    await rememberVerdicts(
      userId,
      MODEL,
      result.checkedIds.map((id) => usable.get(id) ?? { id, isSpam: false, reason: "legitimate" as const })
    );
    if (result.error) {
      // Any AI failure degrades to the rule-based flags instead of failing the page.
      logError("spam.gemini", result.error);
      if (isQuotaError(result.error)) logSecurityEvent("ai_quota_exhausted", { route: "spam" });
      return { aiStatus: "unavailable", verdicts: null, unchecked: 0 };
    }
    fresh.push(...result.verdicts);
    checked = result.checkedIds.length;
  }
  if (grant.limitedBy === "unavailable") return { aiStatus: "unavailable", verdicts: null, unchecked: 0 };

  const unchecked = todo.length - checked;
  const byBudget = grant.limitedBy === "budget";
  const reused = candidates.flatMap((e) => {
    const v = known.get(e.id);
    return v ? [{ id: e.id, ...v }] : [];
  });
  // Nothing checked by AI at all and the budget is why: show the rule-based
  // flags, and say when AI checks come back.
  if (byBudget && checked === 0 && reused.length === 0 && todo.length > 0) {
    return { aiStatus: "budget", verdicts: null, unchecked: 0, aiResetsAt: grant.resetsAt };
  }
  return {
    aiStatus: "generated",
    verdicts: [...reused, ...fresh],
    unchecked,
    ...(unchecked > 0 && byBudget ? { aiResetsAt: grant.resetsAt } : {}),
  };
}

async function buildSpamPayload(accessToken: string, userId: string): Promise<SpamPayload> {
  const { emails } = await readInbox(accessToken, userId, "spam");

  let ai: AiVerdicts = { aiStatus: aiEnabled() ? "generated" : "off", verdicts: null, unchecked: 0 };
  if (ai.aiStatus === "generated") ai = await aiVerdicts(userId, emails);
  const verdicts = ai.verdicts ?? ruleBasedSpamVerdicts(emails);

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
  // The detail records who flagged the card, so the share of AI flags that
  // users mark Not spam can be measured (scripts/ai-feedback.mjs).
  const detail = ai.verdicts ? "flagged by AI" : "flagged by rules";
  await Promise.all(flashcards.map((card) => logAuditEvent({ userId, action: "classified_spam", messageId: card.id, detail })));

  return {
    aiStatus: ai.aiStatus,
    generatedAt: new Date().toISOString(),
    flashcards,
    ...(ai.unchecked > 0 ? { unchecked: ai.unchecked } : {}),
    ...(ai.aiResetsAt ? { aiResetsAt: ai.aiResetsAt } : {}),
  };
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
