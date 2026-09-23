import { GoogleGenAI } from "@google/genai";
import type { ParsedEmail } from "./gmail";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MODEL = "gemini-3.5-flash-lite";

export async function summarizeToday(emails: ParsedEmail[]): Promise<string> {
  if (emails.length === 0) return "No messages received today.";

  const digest = emails
    .map((e, i) => `[${i + 1}] From: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Here are today's emails. Write a concise, skimmable summary (grouped by importance, use short bullet points) of what actually matters. Ignore obvious marketing/newsletter noise unless something is time-sensitive. Do not include a preamble.\n\n${digest}`,
  });

  return response.text ?? "Unable to generate summary.";
}

export type SpamVerdict = { id: string; isSpam: boolean; reason: string };

const SPAM_KEYWORDS = [
  "unsubscribe",
  "% off",
  "limited time",
  "act now",
  "risk-free",
  "click here",
  "winner",
  "congratulations",
  "verify your account",
];

function heuristicSpamScore(email: ParsedEmail): number {
  let score = 0;
  const haystack = `${email.subject} ${email.snippet}`.toLowerCase();
  if (email.subject === email.subject.toUpperCase() && email.subject.length > 6) score += 1;
  if (email.listUnsubscribe) score += 1;
  for (const kw of SPAM_KEYWORDS) {
    if (haystack.includes(kw)) score += 1;
  }
  return score;
}

export async function classifySpam(emails: ParsedEmail[]): Promise<SpamVerdict[]> {
  const inboxEmails = emails.filter((e) => e.isInInbox);
  const candidates = inboxEmails.filter((e) => heuristicSpamScore(e) >= 1);
  if (candidates.length === 0) return [];

  const digest = candidates
    .map((e) => `id: ${e.id}\nFrom: ${e.from}\nSubject: ${e.subject}\nSnippet: ${e.snippet}`)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `Below are emails that are in the inbox (not already in spam/junk) but matched simple spam heuristics. For each, decide if it's actually promotional/spam clutter the user would want flagged (marketing, cold outreach, newsletters, phishing-like patterns) versus a legitimate message that just happened to match a keyword. Respond ONLY with a JSON array of objects: [{"id": "...", "isSpam": true/false, "reason": "short reason"}].\n\n${digest}`,
    config: { responseMimeType: "application/json" },
  });

  const text = response.text;
  if (!text) return [];

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    return JSON.parse(jsonMatch[0]) as SpamVerdict[];
  } catch {
    return [];
  }
}
