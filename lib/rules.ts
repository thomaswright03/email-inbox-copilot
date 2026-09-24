import type { ParsedEmail } from "./gmail";
import { heuristicSpamScore, type SpamVerdict } from "./ai";

// Rule-based fallbacks used whenever Gemini is disabled (see aiEnabled() in
// lib/ai.ts). Nothing here leaves the server.

const MAX_LISTED = 12;
const PHISHING_HINTS = ["verify your account", "winner", "congratulations", "risk-free"];

function senderName(from: string): string {
  const match = from.match(/^"?([^"<]*)"?\s*<[^>]+>$/);
  const name = (match?.[1] ?? from).trim();
  return name || from;
}

// Markdown with no links, images or HTML: sender and subject are escaped so
// they render as plain text.
function plain(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, (c) => `\\${c}`).slice(0, 200);
}

export function ruleBasedSummary(emails: ParsedEmail[]): string {
  if (emails.length === 0) return "No messages received today.";
  const likelyPromo = emails.filter((e) => heuristicSpamScore(e) >= 1);
  const other = emails.filter((e) => heuristicSpamScore(e) === 0);

  const list = (items: ParsedEmail[]) =>
    items
      .slice(0, MAX_LISTED)
      .map((e) => `- **${plain(senderName(e.from))}**: ${plain(e.subject)}`)
      .join("\n") + (items.length > MAX_LISTED ? `\n- …and ${items.length - MAX_LISTED} more` : "");

  const sections: string[] = [];
  if (other.length > 0) sections.push(`**Messages to check (${other.length})**\n\n${list(other)}`);
  if (likelyPromo.length > 0) sections.push(`**Likely promotional or bulk (${likelyPromo.length})**\n\n${list(likelyPromo)}`);
  return sections.join("\n\n");
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
