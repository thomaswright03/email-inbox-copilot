import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ParsedEmail } from "./gmail";
import { SPAM_REASONS, type SpamReason } from "./spam-reasons";
import { emit, toSafeError } from "./log";
import { withRetry } from "./retry";
import { withTimeout } from "./timeout";
import { MODEL, SPAM_RESPONSE_SCHEMA, SPAM_SYSTEM_INSTRUCTION, spamPrompt, SUMMARY_SYSTEM_INSTRUCTION, summaryPrompt } from "./ai-prompts";

export { MODEL };

// Created on first use, so importing this module (builds, AI-off
// deployments, tests) never constructs a client or warns about a missing key.
let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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
export type AiFeature = "summary" | "spam";
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

// How long one Gemini call may take, retries included: a timed-out call is
// treated like any transient error and retried only while the budget
// allows. A summary reads up to 100 emails; a spam check reads one.
export const GEMINI_TIMEOUT_MS: Record<AiFeature, number> = { summary: 10_000, spam: 5_000 };

const geminiGenerate: Generate = async (prompt, config, feature) => {
  if (!aiEnabled()) throw new AiDisabledError();
  const started = Date.now();
  const timeoutMs = GEMINI_TIMEOUT_MS[feature];
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
const FIELD_LIMITS = { from: 200, subject: 300, snippet: 400 } as const;

export function sanitizeForPrompt(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, " ")
    .replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function emailBlock(handle: string, e: ParsedEmail): string {
  return [
    `<email id="${handle}">`,
    `From: ${sanitizeForPrompt(e.from, FIELD_LIMITS.from)}`,
    `Subject: ${sanitizeForPrompt(e.subject, FIELD_LIMITS.subject)}`,
    `Preview: ${sanitizeForPrompt(e.snippet, FIELD_LIMITS.snippet)}`,
    `</email>`,
  ].join("\n");
}

export const SUMMARY_LANGUAGES = { en: "English", es: "Spanish", fr: "French" } as const;
export type SummaryLanguage = keyof typeof SUMMARY_LANGUAGES;

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

const SUMMARY_MAX_OUTPUT_TOKENS = 1024;

// `incomplete`: the model stopped at SUMMARY_MAX_OUTPUT_TOKENS, so the
// summary may leave out the last items. The unfinished last line is
// dropped, and the dashboard says the summary was cut short (every message
// is still listed under it).
export type Summary = { text: string; incomplete: boolean };

// Keeps the summary up to its last complete line (a half-written bullet
// would read as if it were the whole point).
function dropUnfinishedLine(text: string): string {
  const lastBreak = text.trimEnd().lastIndexOf("\n");
  return lastBreak > 0 ? text.slice(0, lastBreak) : text;
}

// Returns null when the model produced nothing usable; the caller then
// falls back to the rule-based view.
export async function summarizeToday(emails: ParsedEmail[], language: SummaryLanguage = "en"): Promise<Summary | null> {
  if (emails.length === 0) return null;

  const digest = emails.map((e, i) => emailBlock(`e${i + 1}`, e)).join("\n\n");

  const reply = asReply(
    await generate(
      summaryPrompt(SUMMARY_LANGUAGES[language], digest),
      { systemInstruction: SUMMARY_SYSTEM_INSTRUCTION, maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS },
      "summary"
    )
  );
  const incomplete = reply.finishReason === "MAX_TOKENS";
  const text = reply.text && incomplete ? dropUnfinishedLine(reply.text) : reply.text;
  const cleaned = text ? stripLinksAndImages(text).trim() : "";
  return cleaned ? { text: cleaned, incomplete } : null;
}

export type SpamVerdict = { id: string; isSpam: boolean; reason: SpamReason };

const ModelVerdictSchema = z
  .object({
    isSpam: z.boolean(),
    reason: z.enum(SPAM_REASONS),
  })
  .strict();

// The model's output only ever drives a UI suggestion (a card the user still
// has to click Delete/Unsubscribe/Ignore on themselves) — but it's still a
// destructive-adjacent decision point, so anything that isn't exactly
// {isSpam: boolean, reason: <one of SPAM_REASONS>} is discarded rather than
// trusted. A verdict of "legitimate" can never be spam.
export function parseModelVerdict(raw: unknown): { isSpam: boolean; reason: SpamReason } | null {
  const parsed = ModelVerdictSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.reason === "legitimate") return { isSpam: false, reason: "legitimate" };
  return parsed.data;
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
// strongest signals first. Every one of them is checked by Gemini, at most
// MAX_CLASSIFY_PER_LOAD per dashboard load; verdicts are cached per message
// (lib/verdict-cache.ts), so the rest are checked on the next load.
export function spamCandidates(emails: ParsedEmail[]): ParsedEmail[] {
  return emails
    .filter((e) => e.isInInbox && heuristicSpamScore(e) >= 1)
    .map((e) => ({ e, score: heuristicSpamScore(e) }))
    .sort((a, b) => b.score - a.score)
    .map(({ e }) => e);
}

// Bounds one load's model calls and how long the spam list waits for them.
export const MAX_CLASSIFY_PER_LOAD = 20;
const CLASSIFY_TIME_BUDGET_MS = 6_000;

const CLASSIFY_CONCURRENCY = 5;

// A classification that ran: the verdict, or null when the model's answer
// was empty or malformed (the message is then not flagged).
type Classified = { email: ParsedEmail; verdict: SpamVerdict | null };

async function classifyOne(email: ParsedEmail): Promise<Classified> {
  // A verdict cut off at the token limit isn't valid JSON, so it is
  // discarded below like any other malformed answer.
  const { text } = asReply(
    await generate(
      spamPrompt(emailBlock("e1", email)),
      {
        systemInstruction: SPAM_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: SPAM_RESPONSE_SCHEMA,
        maxOutputTokens: 128,
      },
      "spam"
    )
  );
  if (!text) return { email, verdict: null };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    logAiUsage({ feature: "spam", outcome: "discarded" });
    return { email, verdict: null };
  }
  const verdict = parseModelVerdict(raw);
  if (!verdict) logAiUsage({ feature: "spam", outcome: "discarded" });
  // The verdict is attached to the id of the email that was sent, never to
  // an id the model names, so one email can't change another's verdict.
  return { email, verdict: verdict ? { id: email.id, ...verdict } : null };
}

export type ClassifyResult = {
  // The usable verdicts.
  verdicts: SpamVerdict[];
  // Every email that was checked, including those whose answer was empty or
  // malformed (they are not flagged, and not sent again).
  checkedIds: string[];
  // Model calls made (each one is charged to the AI budget).
  attempted: number;
  // Set when a model call failed; the caller falls back to the rules.
  error: unknown;
};

// Each candidate is classified in its own model call, so an instruction
// hidden in one email can only ever affect that email's own verdict. Calls
// run CLASSIFY_CONCURRENCY at a time, and no new batch starts once
// `timeBudgetMs` has passed: the emails left over are simply not checked
// on this load.
export async function classifyCandidates(
  candidates: ParsedEmail[],
  { timeBudgetMs = CLASSIFY_TIME_BUDGET_MS }: { timeBudgetMs?: number } = {}
): Promise<ClassifyResult> {
  const started = Date.now();
  const verdicts: SpamVerdict[] = [];
  const checkedIds: string[] = [];
  let attempted = 0;
  for (let i = 0; i < candidates.length; i += CLASSIFY_CONCURRENCY) {
    if (i > 0 && Date.now() - started > timeBudgetMs) break;
    const batch = candidates.slice(i, i + CLASSIFY_CONCURRENCY);
    attempted += batch.length;
    const settled = await Promise.allSettled(batch.map(classifyOne));
    const failure = settled.find((r) => r.status === "rejected");
    if (failure) return { verdicts, checkedIds, attempted, error: failure.reason };
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      checkedIds.push(r.value.email.id);
      if (r.value.verdict) verdicts.push(r.value.verdict);
    }
  }
  return { verdicts, checkedIds, attempted, error: null };
}

// Classifies every heuristic candidate among `emails` with no time limit
// (the evals use this); throws if a model call fails.
export async function classifySpam(emails: ParsedEmail[]): Promise<SpamVerdict[]> {
  const result = await classifyCandidates(spamCandidates(emails), { timeBudgetMs: Infinity });
  if (result.error) throw result.error;
  return result.verdicts;
}
