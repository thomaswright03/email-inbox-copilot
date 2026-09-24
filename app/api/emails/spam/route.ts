import { NextResponse } from "next/server";
import { aiEnabled, languageFrom, MODEL, spamCandidates, type SpamVerdict, type SummaryLanguage } from "@/lib/ai";
import { ruleBasedSpamVerdicts } from "@/lib/rules";
import { logAuditEvent } from "@/lib/audit";
import { getOrSetCached, userCacheKey } from "@/lib/response-cache";
import { RouteError } from "@/lib/route-error";
import { jsonError, rateLimitedResponse, requireSession } from "@/lib/api";
import { enforceRateLimit, RATE_LIMITS, RateLimitError } from "@/lib/rate-limit";
import { cachedVerdicts } from "@/lib/verdict-cache";
import { INBOX_CACHE_TTL_MS, maybeRefresh, readInbox } from "@/lib/inbox";
import { localDayFrom, type LocalDay } from "@/lib/local-day";
import { ignoredMessageIds } from "@/lib/ignored";
import { triageInbox } from "@/lib/triage";
import { gmailComposeUrl, unsubscribeMethod } from "@/lib/unsubscribe";
import type { AiStatus, CardUnsubscribe, SpamPayload } from "@/lib/payloads";
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
  aiResetsAt?: string;
};

// Gemini verdicts for the heuristic candidates. They come from the triage
// call the summary route makes for the same inbox (lib/triage.ts), so the
// spam list costs no model call of its own; verdicts already known from an
// earlier triage (lib/verdict-cache.ts) are reused without asking again.
async function aiVerdicts(userId: string, day: LocalDay, language: SummaryLanguage, emails: ParsedEmail[]): Promise<AiVerdicts> {
  const candidates = spamCandidates(emails);
  const known = await cachedVerdicts(userId, MODEL);
  const reuse = (e: ParsedEmail) => ({ id: e.id, ...known.get(e.id)! });
  if (candidates.every((e) => known.has(e.id))) return { aiStatus: "generated", verdicts: candidates.map(reuse) };

  const triage = await triageInbox(userId, day, language, emails);
  if (triage.aiStatus === "budget") return { aiStatus: "budget", verdicts: null, aiResetsAt: triage.aiResetsAt };
  if (triage.aiStatus !== "generated") return { aiStatus: "unavailable", verdicts: null };
  const fresh = new Map(triage.verdicts.map((v) => [v.id, v]));
  return {
    aiStatus: "generated",
    verdicts: candidates.flatMap((e) => (fresh.has(e.id) ? [fresh.get(e.id)!] : known.has(e.id) ? [reuse(e)] : [])),
  };
}

async function buildSpamPayload(accessToken: string, userId: string, day: LocalDay, language: SummaryLanguage): Promise<SpamPayload> {
  const { emails } = await readInbox(accessToken, userId, day, "spam");

  let ai: AiVerdicts = { aiStatus: aiEnabled() ? "generated" : "off", verdicts: null };
  if (ai.aiStatus === "generated") ai = await aiVerdicts(userId, day, language, emails);
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
    ...(ai.aiResetsAt ? { aiResetsAt: ai.aiResetsAt } : {}),
  };
}

export async function GET(req: Request) {
  const session = await requireSession(req);
  if (session instanceof NextResponse) return session;

  const day = localDayFrom(req);
  // The summary's language, so this route shares the summary's triage call.
  const language = languageFrom(req);
  try {
    await enforceRateLimit(RATE_LIMITS.inboxReads, session.userId);
    await maybeRefresh(req, session.userId, day, "spam");
    const [payload, ignored] = await Promise.all([
      getOrSetCached(userCacheKey("spam", session.userId, day), INBOX_CACHE_TTL_MS, () =>
        buildSpamPayload(session.accessToken, session.userId, day, language)
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
