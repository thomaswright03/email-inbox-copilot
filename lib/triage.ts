import { MODEL, triageToday, type BriefingItem, type SpamVerdict, type SummaryLanguage } from "./ai";
import type { ParsedEmail } from "./gmail";
import { INBOX_CACHE_TTL_MS } from "./inbox";
import { describeNow, type LocalDay } from "./local-day";
import { isQuotaError, logError, logSecurityEvent } from "./log";
import { reserveAiCalls } from "./rate-limit";
import { getOrSetCached, userCacheKey } from "./response-cache";
import { rememberVerdicts } from "./verdict-cache";

// The one Gemini call behind a dashboard load (lib/ai.ts triageToday): the
// briefing for the summary tab and a spam verdict for every email, shared
// by both routes. The summary and spam routes run in parallel; whichever
// asks first makes the call and the other waits for the same answer
// (getOrSetCached shares a fetch in flight), then it is cached per user,
// day and language for the same 5 minutes as the rest of the inbox data.
//
// A cached triage is reused as long as it covers every email now in the
// inbox, so Done, Undo, Delete or a Refresh with no new mail don't cost a
// new call; only mail that arrived since (or the cache expiring) does.
export type TriageOutcome =
  | { aiStatus: "generated"; ids: string[]; items: BriefingItem[]; verdicts: SpamVerdict[] }
  | { aiStatus: "unavailable" }
  | { aiStatus: "budget"; aiResetsAt: string };

function covers(outcome: TriageOutcome, inbox: ParsedEmail[]): boolean {
  if (outcome.aiStatus !== "generated") return false;
  const ids = new Set(outcome.ids);
  return inbox.every((e) => ids.has(e.id));
}

async function runTriage(userId: string, day: LocalDay, language: SummaryLanguage, inbox: ParsedEmail[]): Promise<TriageOutcome> {
  if (inbox.length === 0) return { aiStatus: "generated", ids: [], items: [], verdicts: [] };
  const grant = await reserveAiCalls(userId, 1);
  if (grant.granted === 0) {
    // Over today's AI budget (or it can't be checked): the rule-based
    // views, and the user is told when AI comes back.
    return grant.limitedBy === "budget" ? { aiStatus: "budget", aiResetsAt: grant.resetsAt } : { aiStatus: "unavailable" };
  }
  try {
    const triage = await triageToday(inbox, { language, now: describeNow(day.timeZone) });
    if (!triage) return { aiStatus: "unavailable" };
    // Spam verdicts are also kept per message (ids and fixed reasons only),
    // so the spam list can be rebuilt without asking again.
    await rememberVerdicts(userId, MODEL, triage.verdicts);
    return { aiStatus: "generated", ids: inbox.map((e) => e.id), ...triage };
  } catch (err) {
    // Any AI failure degrades to the rule-based views instead of failing the page.
    logError("triage.gemini", err);
    if (isQuotaError(err)) logSecurityEvent("ai_quota_exhausted", { route: "triage" });
    return { aiStatus: "unavailable" };
  }
}

// Only answers worth keeping are cached: a failure or an exhausted budget is
// retried on the next uncached load.
export async function triageInbox(
  userId: string,
  day: LocalDay,
  language: SummaryLanguage,
  emails: ParsedEmail[]
): Promise<TriageOutcome> {
  const inbox = emails.filter((e) => e.isInInbox);
  return getOrSetCached(userCacheKey("triage", userId, day, language), INBOX_CACHE_TTL_MS, () => runTriage(userId, day, language, inbox), {
    reuse: (cached) => covers(cached, inbox),
    store: (fresh) => fresh.aiStatus === "generated",
  });
}

// The briefing for the emails in the inbox now, newest first: the triage's
// item for each, or FYI for one it didn't cover.
export function briefingFor(emails: ParsedEmail[], items: BriefingItem[]): BriefingItem[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return emails
    .filter((e) => e.isInInbox)
    .map((e) => byId.get(e.id) ?? { id: e.id, bucket: "fyi" as const, action: "", due: "", dueDate: "" });
}
