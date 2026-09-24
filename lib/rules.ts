import type { ParsedEmail } from "./gmail";
import { heuristicSpamScore, type SpamVerdict } from "./ai";
import type { SpamReason } from "./spam-reasons";

// Rule-based fallbacks used whenever Gemini is off, fails, or is over its
// budget (see the email routes). Nothing here leaves the server.

// Which reason a rule-based flag shows. Checked in this order: phishing
// patterns, then promotional wording (a discount, urgency, an offer, or an
// all-caps subject), then digest-like wording; a bulk sender with none of
// these is called a newsletter only if it has an unsubscribe header.
const PHISHING_HINTS = [
  /verify your account/,
  /\bwinner\b/,
  /you (have been|were) selected/,
  /claim your (prize|reward|gift)/,
  /\b(account|mailbox) (will be )?suspended\b/,
  /unusual (activity|sign-in)/,
];
const PROMO_HINTS = [
  /\d+\s?% off/,
  /\b(sale|clearance|discount|bogo|coupon)s?\b/,
  /\b(offer|deal)s?\b/,
  /\bbuy one\b/,
  /\bfree (shipping|trial|gift)\b|\bfirst month free\b|\bget one free\b/,
  /\b(limited time|act now|last chance|while stocks last|ends (tonight|today|sunday|soon))\b/,
  /\b(shop|save|upgrade) (now|today|big)\b|\bsave \d+/,
  /\buse code\b/,
  /\bexclusive\b/,
];
const DIGEST_HINTS = [
  /\b(newsletter|digest|roundup|briefing|bulletin|headlines)\b/,
  /\b(issue|edition|episode)s?\b/,
  /\b(weekly|monthly|daily)\b/,
  /\bthis week\b|\bin this issue\b/,
];

function isAllCaps(subject: string): boolean {
  return subject === subject.toUpperCase() && /[A-Z]/.test(subject) && subject.length > 6;
}

export function ruleBasedReason(e: ParsedEmail): SpamReason {
  const haystack = `${e.subject} ${e.snippet}`.toLowerCase();
  if (PHISHING_HINTS.some((re) => re.test(haystack))) return "phishing_pattern";
  if (isAllCaps(e.subject) || PROMO_HINTS.some((re) => re.test(haystack))) return "marketing";
  if (DIGEST_HINTS.some((re) => re.test(haystack))) return "newsletter";
  return e.listUnsubscribe ? "newsletter" : "marketing";
}

// The rule-based "summary": message ids split into ones worth checking and
// likely bulk mail. The dashboard renders the lists (with translated
// headings) from the message list it already has.
export type RuleGroups = { toCheck: string[]; bulk: string[] };

export function ruleBasedGroups(emails: ParsedEmail[]): RuleGroups {
  const toCheck: string[] = [];
  const bulk: string[] = [];
  for (const e of emails) (heuristicSpamScore(e) >= 1 ? bulk : toCheck).push(e.id);
  return { toCheck, bulk };
}

export function ruleBasedSpamVerdicts(emails: ParsedEmail[]): SpamVerdict[] {
  return emails
    .filter((e) => e.isInInbox && heuristicSpamScore(e) >= 2)
    .map((e) => ({ id: e.id, isSpam: true, reason: ruleBasedReason(e) }) satisfies SpamVerdict);
}
