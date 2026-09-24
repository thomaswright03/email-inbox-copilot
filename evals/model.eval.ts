// Scores the current prompts and model (lib/ai.ts) against the golden sets
// by calling Gemini for real: `npm run eval`. It needs GEMINI_API_KEY and
// GEMINI_PAID_TIER_PROJECT (paid tier only; see evals/README.md), from the
// shell or .env.local. About 45 small model calls per run.
import { beforeAll, describe, expect, it } from "vitest";
import { aiEnabled, classifySpam, MODEL, summarizeToday } from "@/lib/ai";
import { SPAM_CASES } from "./golden/spam";
import { SUMMARY_FIXTURES } from "./golden/summary";
import { formatSpamScore, MODEL_THRESHOLDS, scoreSpam, scoreSummaries, toParsedEmail, type SpamPrediction } from "./scoring";

describe(`${MODEL} against the golden sets`, () => {
  beforeAll(() => {
    if (!aiEnabled()) {
      throw new Error(
        "npm run eval calls Gemini: set GEMINI_API_KEY and GEMINI_PAID_TIER_PROJECT (a billing-enabled project) in the shell or .env.local. `npm run eval:rules` scores the rule-based fallback offline."
      );
    }
  });

  it("classifies spam well enough", async () => {
    const predictions = new Map<string, SpamPrediction>();
    // One email per call, as in production (the heuristic pre-filter still
    // decides which emails reach the model at all).
    for (const c of SPAM_CASES) {
      const [verdict] = await classifySpam([toParsedEmail(c)]);
      predictions.set(c.id, verdict ? { isSpam: verdict.isSpam, reason: verdict.reason } : { isSpam: false, reason: null });
    }
    const score = scoreSpam(SPAM_CASES, predictions);
    console.log(formatSpamScore(MODEL, score));

    expect(score.accuracy).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.spamAccuracy);
    expect(score.precision).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.spamPrecision);
    expect(score.recall).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.spamRecall);
    expect(score.reasonAccuracy).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.reasonAccuracy);
  });

  it("summarizes what matters, in the right language, without links or injected text", async () => {
    const summaries = new Map<string, string | null>();
    for (const f of SUMMARY_FIXTURES) {
      const briefing = await summarizeToday(f.emails.map((e, i) => toParsedEmail(e, `${f.id}-${i}`)), f.language);
      // Scored on the model's own words: each item's action line and date.
      summaries.set(f.id, briefing ? briefing.map((item) => `${item.action} ${item.due}`).join("\n") : null);
    }
    const score = scoreSummaries(SUMMARY_FIXTURES, summaries);
    console.log(
      [
        `${MODEL} summaries: coverage ${(score.coverage * 100).toFixed(1)}%`,
        ...score.missing.map((m) => `  - ${m.id}: missing any of ${m.group.join(" / ")}`),
        ...score.forbidden.map((f) => `  - ${f.id}: contains forbidden "${f.text}"`),
      ].join("\n")
    );

    expect(score.forbidden).toEqual([]);
    expect(score.coverage).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.summaryCoverage);
  });
});
