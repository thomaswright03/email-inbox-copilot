// Scoring for the golden sets. Pure functions, so they are unit-tested in
// the normal suite (lib/__tests__/eval-scoring.test.ts) and the eval runs
// only add the model calls.
import type { ParsedEmail } from "@/lib/gmail";
import type { SpamReason } from "@/lib/spam-reasons";
import type { SpamCase } from "./golden/spam";
import type { SummaryFixture } from "./golden/summary";

// Minimum scores. `npm run eval` fails when the model is below any of them;
// `npm run eval:rules` holds the rule-based fallback to its own floor so a
// rules change can't quietly make it worse.
export const MODEL_THRESHOLDS = {
  spamAccuracy: 0.85,
  // Of the messages flagged as spam, how many really are. Kept high because
  // a false flag puts a real email one click from Trash.
  spamPrecision: 0.85,
  spamRecall: 0.75,
  // Of the spam that was caught, how often the shown reason is right.
  reasonAccuracy: 0.7,
  summaryCoverage: 0.8,
} as const;

// Measured on 2026-09-24: accuracy 68.4%, precision 92.9%, recall 54.2%,
// reason 46.2%. The rules are cautious (few false flags) but miss cold
// outreach and most phishing; the floor sits just under that baseline.
export const RULES_THRESHOLDS = {
  spamAccuracy: 0.65,
  spamPrecision: 0.85,
  spamRecall: 0.5,
  reasonAccuracy: 0.4,
} as const;

export function toParsedEmail(c: { id?: string; from: string; subject: string; snippet: string; listUnsubscribe?: string }, id = c.id ?? "e1"): ParsedEmail {
  return {
    id,
    threadId: id,
    from: c.from,
    subject: c.subject,
    snippet: c.snippet,
    date: "",
    listUnsubscribe: c.listUnsubscribe ?? null,
    listUnsubscribePost: null,
    isInInbox: true,
  };
}

export type SpamPrediction = { isSpam: boolean; reason: SpamReason | null };

export type SpamScore = {
  total: number;
  accuracy: number;
  precision: number;
  recall: number;
  reasonAccuracy: number;
  mistakes: { id: string; expected: string; got: string }[];
};

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function scoreSpam(cases: SpamCase[], predictions: Map<string, SpamPrediction>): SpamScore {
  let correct = 0;
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let reasonRight = 0;
  const mistakes: SpamScore["mistakes"] = [];
  for (const c of cases) {
    const p = predictions.get(c.id) ?? { isSpam: false, reason: null };
    if (p.isSpam === c.expected.isSpam) correct++;
    if (p.isSpam && c.expected.isSpam) {
      truePositive++;
      if (p.reason === c.expected.reason) reasonRight++;
    }
    if (p.isSpam && !c.expected.isSpam) falsePositive++;
    if (!p.isSpam && c.expected.isSpam) falseNegative++;
    const got = p.isSpam ? `spam/${p.reason}` : "not spam";
    const expected = c.expected.isSpam ? `spam/${c.expected.reason}` : "not spam";
    if (got !== expected) mistakes.push({ id: c.id, expected, got });
  }
  return {
    total: cases.length,
    accuracy: ratio(correct, cases.length),
    precision: ratio(truePositive, truePositive + falsePositive),
    recall: ratio(truePositive, truePositive + falseNegative),
    reasonAccuracy: ratio(reasonRight, truePositive),
    mistakes,
  };
}

export type SummaryScore = {
  coverage: number;
  missing: { id: string; group: string[] }[];
  forbidden: { id: string; text: string }[];
};

export function scoreSummaries(fixtures: SummaryFixture[], summaries: Map<string, string | null>): SummaryScore {
  let found = 0;
  let wanted = 0;
  const missing: SummaryScore["missing"] = [];
  const forbidden: SummaryScore["forbidden"] = [];
  for (const f of fixtures) {
    const text = (summaries.get(f.id) ?? "").toLowerCase();
    for (const group of f.mustMention) {
      wanted++;
      if (group.some((word) => text.includes(word.toLowerCase()))) found++;
      else missing.push({ id: f.id, group });
    }
    for (const bad of f.mustNotContain) {
      if (text.includes(bad.toLowerCase())) forbidden.push({ id: f.id, text: bad });
    }
  }
  return { coverage: ratio(found, wanted), missing, forbidden };
}

export function formatSpamScore(label: string, s: SpamScore): string {
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  return [
    `${label}: ${s.total} cases`,
    `  accuracy ${pct(s.accuracy)}  precision ${pct(s.precision)}  recall ${pct(s.recall)}  reason ${pct(s.reasonAccuracy)}`,
    ...s.mistakes.map((m) => `  - ${m.id}: expected ${m.expected}, got ${m.got}`),
  ].join("\n");
}
