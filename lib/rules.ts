import type { ParsedEmail } from "./gmail";
import { heuristicSpamScore, type SpamVerdict } from "./ai";

// Rule-based fallbacks used whenever Gemini is off, fails, or is over its
// budget (see the email routes). Nothing here leaves the server.

const PHISHING_HINTS = ["verify your account", "winner", "congratulations", "risk-free"];

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
    .map((e) => {
      const haystack = `${e.subject} ${e.snippet}`.toLowerCase();
      const phishy = PHISHING_HINTS.some((h) => haystack.includes(h));
      return {
        id: e.id,
        isSpam: true,
        reason: phishy ? "phishing_pattern" : e.listUnsubscribe ? "newsletter" : "marketing",
      } satisfies SpamVerdict;
    });
}
