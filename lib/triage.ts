import { MODEL, triageChunks, triageToday, type BriefingItem, type SpamVerdict, type SummaryLanguage, type Triage } from "./ai";
import type { ParsedEmail } from "./gmail";
import { INBOX_CACHE_TTL_MS } from "./inbox";
import { describeNow, type LocalDay } from "./local-day";
import { isQuotaError, logError, logSecurityEvent } from "./log";
import { reserveAiCalls } from "./rate-limit";
import { getOrSetCached, userCacheKey } from "./response-cache";
import { ruleBasedTriage } from "./rules";
import { rememberVerdicts } from "./verdict-cache";

// The Gemini calls behind a dashboard load (lib/ai.ts triageToday): the
// briefing for the summary tab and a spam verdict for every email, shared
// by both routes. The day's inbox (up to 100 emails) is split into chunks of
// TRIAGE_CHUNK_SIZE (25), one call each, made at the same time, so a load
// makes ceil(n / 25) calls: at most 4. Each chunk's answer is validated on
// its own; a chunk whose call fails (or that the day's AI budget has no room
// for) gets the rule-based view for just its emails (lib/rules.ts
// ruleBasedTriage), listed in `ruleIds`. Only when every call fails is the
// whole load "unavailable".
//
// The summary and spam routes run in parallel; whichever asks first makes
// the calls and the other waits for the same answer (getOrSetCached shares
// a fetch in flight), then it is cached per user, day and language for the
// same 5 minutes as the rest of the inbox data. A cached triage is reused as
// long as it covers every email now in the inbox, so Done, Undo, Delete or a
// Refresh with no new mail don't cost a new call; only mail that arrived
// since (or the cache expiring) does.
//
// A failure is cached too, for TRIAGE_FAILURE_BACKOFF_MS, so reloading while
// Gemini is down (or slow) doesn't make a new round of calls each time: a
// load that was "unavailable" is reused as it is, and one where some chunks
// fell back to the rules is reused while it covers the inbox, both until
// the back-off ends.
export const TRIAGE_FAILURE_BACKOFF_MS = 60_000;

export type TriageOutcome =
  | {
      aiStatus: "generated";
      ids: string[];
      items: BriefingItem[];
      verdicts: SpamVerdict[];
      // Emails whose item and verdict come from the rules, because their
      // chunk's call failed or didn't fit in the AI budget.
      ruleIds?: string[];
    }
  | { aiStatus: "unavailable" }
  | { aiStatus: "budget"; aiResetsAt: string };

function covers(outcome: TriageOutcome, inbox: ParsedEmail[]): boolean {
  if (outcome.aiStatus !== "generated") return false;
  const ids = new Set(outcome.ids);
  return inbox.every((e) => ids.has(e.id));
}

// Kept for the full 5 minutes only when every email was triaged by the model.
function complete(outcome: TriageOutcome): boolean {
  return outcome.aiStatus === "generated" && (outcome.ruleIds?.length ?? 0) === 0;
}

// One chunk's call. Any failure is logged and becomes null, so it costs only
// this chunk's emails, not the page.
async function triageChunk(chunk: ParsedEmail[], language: SummaryLanguage, now: string): Promise<Triage | null> {
  try {
    return await triageToday(chunk, { language, now });
  } catch (err) {
    logError("triage.gemini", err);
    if (isQuotaError(err)) logSecurityEvent("ai_quota_exhausted", { route: "triage" });
    return null;
  }
}

async function runTriage(userId: string, day: LocalDay, language: SummaryLanguage, inbox: ParsedEmail[]): Promise<TriageOutcome> {
  if (inbox.length === 0) return { aiStatus: "generated", ids: [], items: [], verdicts: [], ruleIds: [] };
  const chunks = triageChunks(inbox);
  // One unit of the daily AI budgets per call.
  const grant = await reserveAiCalls(userId, chunks.length);
  if (grant.granted === 0) {
    // Over today's AI budget (or it can't be checked): the rule-based
    // views, and the user is told when AI comes back.
    return grant.limitedBy === "budget" ? { aiStatus: "budget", aiResetsAt: grant.resetsAt } : { aiStatus: "unavailable" };
  }
  const now = describeNow(day.timeZone);
  // Newest mail first, so if the budget only has room for some of the
  // calls, it is the newest emails that the model sorts.
  const answers = await Promise.all(chunks.map((chunk, i) => (i < grant.granted ? triageChunk(chunk, language, now) : null)));
  if (answers.every((answer) => answer === null)) return { aiStatus: "unavailable" };

  const items: BriefingItem[] = [];
  const verdicts: SpamVerdict[] = [];
  const aiVerdicts: SpamVerdict[] = [];
  const ruleIds: string[] = [];
  chunks.forEach((chunk, i) => {
    const answer = answers[i] ?? ruleBasedTriage(chunk);
    items.push(...answer.items);
    verdicts.push(...answer.verdicts);
    if (answers[i]) aiVerdicts.push(...answer.verdicts);
    else ruleIds.push(...chunk.map((e) => e.id));
  });

  // The model's spam verdicts are also kept per message (ids and fixed
  // reasons only), so the spam list can be rebuilt without asking again.
  // Rule-based ones are not: those emails are asked about next time.
  try {
    await rememberVerdicts(userId, MODEL, aiVerdicts);
  } catch (err) {
    logError("triage.verdicts", err);
  }
  return { aiStatus: "generated", ids: inbox.map((e) => e.id), items, verdicts, ruleIds };
}

export async function triageInbox(
  userId: string,
  day: LocalDay,
  language: SummaryLanguage,
  emails: ParsedEmail[]
): Promise<TriageOutcome> {
  const inbox = emails.filter((e) => e.isInInbox);
  return getOrSetCached(userCacheKey("triage", userId, day, language), INBOX_CACHE_TTL_MS, () => runTriage(userId, day, language, inbox), {
    reuse: (cached) => cached.aiStatus === "unavailable" || covers(cached, inbox),
    // An exhausted budget is checked again on the next load; it costs no call.
    store: (fresh) => fresh.aiStatus !== "budget",
    ttl: (fresh) => (complete(fresh) ? INBOX_CACHE_TTL_MS : TRIAGE_FAILURE_BACKOFF_MS),
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
