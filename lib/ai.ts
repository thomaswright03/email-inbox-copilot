import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ParsedEmail } from "./gmail";
import { SPAM_REASONS, type SpamReason } from "./spam-reasons";
import { emit, toSafeError } from "./log";
import { withRetry } from "./retry";
import { withTimeout } from "./timeout";
import { BRIEFING_BUCKETS, MODEL, TRIAGE_RESPONSE_SCHEMA, TRIAGE_SYSTEM_INSTRUCTION, triagePrompt } from "./ai-prompts";

export { MODEL, BRIEFING_BUCKETS };

// Created on first use, so importing this module (builds, AI-off
// deployments, tests) never constructs a client or warns about a missing key.
// GEMINI_API_ROOT_URL points the client at a stand-in Gemini API for the
// end-to-end tests (e2e/gemini-stub.mjs), like GMAIL_API_ROOT_URL for
// Gmail. It must never be set in a real deployment; instrumentation.ts
// raises an alert if it is set in production.
let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  const baseUrl = process.env.GEMINI_API_ROOT_URL;
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, ...(baseUrl ? { httpOptions: { baseUrl } } : {}) });
  return client;
}

// Gmail-derived data may only go to Gemini under Google's *paid* API terms,
// where Google doesn't use prompts or responses to improve its products (the
// free tier allows that, which the Google Workspace API User Data Policy
// forbids for Gmail data). The code can't see the Google Cloud billing
// console, so the operator attests to it by setting GEMINI_PAID_TIER_PROJECT
// to the billing-enabled Google Cloud project that owns GEMINI_API_KEY (see
// docs/compliance-records.md). Without it, nothing is sent to Gemini and the
// app falls back to the rule-based summary and spam flags in lib/rules.ts.
export function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim()) && Boolean(process.env.GEMINI_PAID_TIER_PROJECT?.trim());
}

class AiDisabledError extends Error {
  constructor() {
    super("Gemini is disabled: GEMINI_PAID_TIER_PROJECT is not set");
  }
}

type GenerateConfig = {
  systemInstruction: string;
  maxOutputTokens: number;
  responseMimeType?: string;
  responseJsonSchema?: unknown;
};
// One model call per dashboard load: the triage (briefing + spam verdicts).
export type AiFeature = "triage";
// The model's text and why it stopped ("STOP", or "MAX_TOKENS" when it hit
// maxOutputTokens mid-answer). A bare string is a reply that finished.
type ModelReply = { text: string | undefined; finishReason?: string };
type Generate = (prompt: string, config: GenerateConfig, feature: AiFeature) => Promise<ModelReply | string | undefined>;

function asReply(reply: ModelReply | string | undefined): ModelReply {
  return typeof reply === "object" ? reply : { text: reply };
}

// One structured line per model call, for cost and quality tracking. It
// never contains prompt or response text.
function logAiUsage(fields: {
  feature: AiFeature;
  outcome: "ok" | "empty" | "error" | "discarded" | "truncated";
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}): void {
  emit("info", { level: "ai_usage", model: MODEL, ...fields });
}

// How long the triage call may take, retries included: a timed-out call is
// treated like any transient error and retried only while the budget
// allows. It reads up to 100 emails.
export const GEMINI_TIMEOUT_MS = 10_000;

const geminiGenerate: Generate = async (prompt, config, feature) => {
  if (!aiEnabled()) throw new AiDisabledError();
  const started = Date.now();
  const timeoutMs = GEMINI_TIMEOUT_MS;
  try {
    const response = await withRetry(
      () =>
        withTimeout(
          (abortSignal) => gemini().models.generateContent({ model: MODEL, contents: prompt, config: { ...config, abortSignal } }),
          timeoutMs
        ),
      { budgetMs: timeoutMs }
    );
    const text = response.text;
    const finishReason = response.candidates?.[0]?.finishReason;
    logAiUsage({
      feature,
      outcome: text ? (finishReason === "MAX_TOKENS" ? "truncated" : "ok") : "empty",
      latencyMs: Date.now() - started,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
    });
    return { text, finishReason };
  } catch (err) {
    logAiUsage({ feature, outcome: "error", latencyMs: Date.now() - started, error: toSafeError(err).name });
    throw err;
  }
};

let generate: Generate = geminiGenerate;

// Test seam: lets tests observe exactly what is sent to the model.
export function __setModelForTests(fake: Generate | null): void {
  generate = fake ?? geminiGenerate;
}

// Every field below comes from whoever sent the email, so all of it is
// attacker-controlled text headed into a prompt. It is bounded in size,
// stripped of control characters and angle brackets (so it can't close or
// forge the <email> delimiters), and presented to the model as quoted data
// under a system instruction that says so.
const FIELD_LIMITS = { from: 200, subject: 300, snippet: 400, date: 80 } as const;

export function sanitizeForPrompt(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

// The Date header is included so the triage can judge what is time-sensitive.
function emailBlock(handle: string, e: ParsedEmail): string {
  return [
    `<email id="${handle}">`,
    `From: ${sanitizeForPrompt(e.from, FIELD_LIMITS.from)}`,
    ...(e.date ? [`Received: ${sanitizeForPrompt(e.date, FIELD_LIMITS.date)}`] : []),
    `Subject: ${sanitizeForPrompt(e.subject, FIELD_LIMITS.subject)}`,
    `Preview: ${sanitizeForPrompt(e.snippet, FIELD_LIMITS.snippet)}`,
    `</email>`,
  ].join("\n");
}

export const SUMMARY_LANGUAGES = { en: "English", es: "Spanish", fr: "French" } as const;
export type SummaryLanguage = keyof typeof SUMMARY_LANGUAGES;

// The language the briefing is written in: `?lang=` on the request, else English.
export function languageFrom(req: Request): SummaryLanguage {
  const lang = new URL(req.url).searchParams.get("lang");
  return lang && lang in SUMMARY_LANGUAGES ? (lang as SummaryLanguage) : "en";
}

// Belt and braces on top of the system instruction: whatever the model
// returns, links and images are reduced to their text before the summary
// leaves the server (the dashboard also refuses to render them).
export function stripLinksAndImages(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Remove every angle bracket rather than trying to match whole tags, so
    // no partial or nested tag can survive (the renderer skips HTML anyway).
    .replace(/[<>]/g, "");
}

// Room for a line on each of the (up to 100) emails in the window.
const TRIAGE_MAX_OUTPUT_TOKENS = 12_288;

export type BriefingBucket = (typeof BRIEFING_BUCKETS)[number];

// One line of the briefing. `id` is always the id of an email that was sent
// to the model, never one the model made up. `action` and `due` are model
// output over attacker-written emails, shown as plain text only. `dueDate`
// is the date the email names as YYYY-MM-DD in the user's time zone (or ""),
// which is how the dashboard knows what is due today.
export type BriefingItem = { id: string; bucket: BriefingBucket; action: string; due: string; dueDate: string };

export type SpamVerdict = { id: string; isSpam: boolean; reason: SpamReason };

// What one triage call produces: a briefing item and a spam verdict for
// each email that was sent.
export type Triage = { items: BriefingItem[]; verdicts: SpamVerdict[] };

const TEXT_LIMITS = { action: 160, due: 40 } as const;

const ModelTriageItemSchema = z
  .object({
    id: z.string(),
    bucket: z.enum(BRIEFING_BUCKETS),
    action: z.string(),
    due: z.string(),
    dueDate: z.string(),
    spam: z.boolean(),
    spamReason: z.enum(SPAM_REASONS),
  })
  .strict();

// A real calendar date as YYYY-MM-DD, or "" (the model's answer when the
// email names no date, and what anything else is reduced to).
const IsoDateSchema = z.iso.date();
function cleanDueDate(value: string): string {
  return IsoDateSchema.safeParse(value).success ? value : "";
}

// Model text shown on the dashboard: links, images and angle brackets are
// removed, whitespace is collapsed, and the length is capped.
function cleanModelText(value: string, maxLength: number): string {
  return stripLinksAndImages(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

const NOT_SPAM = { isSpam: false, reason: "legitimate" } as const;

// Only a spam verdict with a spam reason counts; "legitimate" is never spam.
function normalizeVerdict(isSpam: boolean, reason: SpamReason): { isSpam: boolean; reason: SpamReason } {
  return isSpam && reason !== "legitimate" ? { isSpam, reason } : NOT_SPAM;
}

// Anything that isn't exactly the expected shape is dropped, one entry at a
// time, so one malformed item doesn't cost the rest. Items are matched to
// emails by the handle each email was sent under (`handles`); an unknown or
// repeated handle is dropped. Emails the model left out are listed as FYI
// and not spam, so nothing in the inbox silently disappears.
//
// All emails share one call, so a spam flag is only honoured for an email
// that cleared the heuristic pre-filter by itself (spamCandidates): text
// planted in one email can't get an ordinary message flagged, and the
// verdict only ever drives a card the user still has to act on.
export function parseTriage(raw: unknown, handles: Map<string, ParsedEmail>): Triage | null {
  if (typeof raw !== "object" || raw === null || !Array.isArray((raw as { items?: unknown }).items)) return null;
  const byId = new Map<string, { item: BriefingItem; verdict: SpamVerdict }>();
  for (const entry of (raw as { items: unknown[] }).items) {
    const parsed = ModelTriageItemSchema.safeParse(entry);
    if (!parsed.success) continue;
    const email = handles.get(parsed.data.id);
    if (!email || byId.has(email.id)) continue;
    const { bucket, action, due, dueDate, spam, spamReason } = parsed.data;
    const verdict = heuristicSpamScore(email) >= 1 ? normalizeVerdict(spam, spamReason) : NOT_SPAM;
    byId.set(email.id, {
      item: {
        id: email.id,
        bucket,
        action: bucket === "noise" ? "" : cleanModelText(action, TEXT_LIMITS.action),
        due: cleanModelText(due, TEXT_LIMITS.due),
        dueDate: cleanDueDate(dueDate),
      },
      verdict: { id: email.id, ...verdict },
    });
  }
  if (byId.size === 0) return null;
  // Newest first, the same order as the message list.
  const emails = [...handles.values()];
  return {
    items: emails.map((e) => byId.get(e.id)?.item ?? { id: e.id, bucket: "fyi" as const, action: "", due: "", dueDate: "" }),
    verdicts: emails.map((e) => byId.get(e.id)?.verdict ?? { id: e.id, ...NOT_SPAM }),
  };
}

// The triage: each email still in the inbox is sorted into reply /
// deadline / fyi / noise with a one-line action and any date it names, and
// gets a spam verdict, all in one JSON call. `now` is the user's local date
// and time (lib/local-day.ts describeNow). Returns null when there is
// nothing to sort or the model produced nothing usable; the caller then
// falls back to the rule-based views. A reply cut off at the output limit
// isn't valid JSON, so it is discarded like any other malformed answer.
export async function triageToday(
  emails: ParsedEmail[],
  { language = "en", now }: { language?: SummaryLanguage; now: string }
): Promise<Triage | null> {
  const inbox = emails.filter((e) => e.isInInbox);
  if (inbox.length === 0) return null;

  const handles = new Map(inbox.map((e, i) => [`e${i + 1}`, e]));
  const digest = [...handles].map(([handle, e]) => emailBlock(handle, e)).join("\n\n");

  const { text } = asReply(
    await generate(
      triagePrompt(SUMMARY_LANGUAGES[language], now, digest),
      {
        systemInstruction: TRIAGE_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: TRIAGE_RESPONSE_SCHEMA,
        maxOutputTokens: TRIAGE_MAX_OUTPUT_TOKENS,
      },
      "triage"
    )
  );
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    logAiUsage({ feature: "triage", outcome: "discarded" });
    return null;
  }
  const triage = parseTriage(raw, handles);
  if (!triage) logAiUsage({ feature: "triage", outcome: "discarded" });
  return triage;
}

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

export function heuristicSpamScore(email: ParsedEmail): number {
  let score = 0;
  const haystack = `${email.subject} ${email.snippet}`.toLowerCase();
  if (email.subject === email.subject.toUpperCase() && email.subject.length > 6) score += 1;
  if (email.listUnsubscribe) score += 1;
  for (const kw of SPAM_KEYWORDS) {
    if (haystack.includes(kw)) score += 1;
  }
  return score;
}

// The emails that could be spam: inbox messages that tripped the heuristic,
// strongest signals first. Only these can be flagged (parseTriage).
export function spamCandidates(emails: ParsedEmail[]): ParsedEmail[] {
  return emails
    .filter((e) => e.isInInbox && heuristicSpamScore(e) >= 1)
    .map((e) => ({ e, score: heuristicSpamScore(e) }))
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e);
}

// The spam verdicts one triage call gives the heuristic candidates among
// `emails` (the evals use this); throws if the model call fails.
export async function classifySpam(emails: ParsedEmail[], now = "an unspecified day"): Promise<SpamVerdict[]> {
  const candidates = new Set(spamCandidates(emails).map((e) => e.id));
  if (candidates.size === 0) return [];
  const triage = await triageToday(emails, { now });
  return triage ? triage.verdicts.filter((v) => candidates.has(v.id)) : [];
}
