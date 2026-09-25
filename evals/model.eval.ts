// Scores the current prompts and model (lib/ai.ts) against the golden sets
// by calling Gemini for real: `npm run eval`. It needs GEMINI_API_KEY and
// GEMINI_PAID_TIER_PROJECT (paid tier only; see evals/README.md), from the
// shell or .env.local. About 50 small triage calls per run.
import { beforeAll, describe, expect, it } from "vitest";
import { aiEnabled, classifySpam, MODEL, TRIAGE_CHUNK_SIZE, triageToday } from "@/lib/ai";
import { BUCKET_FIXTURES } from "./golden/buckets";
import { SPAM_CASES } from "./golden/spam";
import { SUMMARY_FIXTURES } from "./golden/summary";
import {
  formatBucketScore,
  formatSpamScore,
  mixedSpamInboxes,
  MODEL_THRESHOLDS,
  scoreBuckets,
  scoreSpam,
  scoreSummaries,
  toParsedEmail,
  type BucketPrediction,
  type SpamPrediction,
} from "./scoring";

function expectSpamScore(score: ReturnType<typeof scoreSpam>) {
  expect(score.accuracy).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.spamAccuracy);
  expect(score.precision).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.spamPrecision);
  expect(score.recall).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.spamRecall);
  expect(score.reasonAccuracy).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.reasonAccuracy);
}

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
    // Each case is triaged as the only email in its inbox, so the score is
    // the verdict alone (in production the same triage call also sorts the
    // briefing; the heuristic pre-filter still decides which emails can be
    // flagged at all).
    for (const c of SPAM_CASES) {
      const [verdict] = await classifySpam([toParsedEmail(c)]);
      predictions.set(c.id, verdict ? { isSpam: verdict.isSpam, reason: verdict.reason } : { isSpam: false, reason: null });
    }
    const score = scoreSpam(SPAM_CASES, predictions);
    console.log(formatSpamScore(MODEL, score));
    expectSpamScore(score);
  });

  it("classifies spam well enough when spam and legitimate mail share one inbox", async () => {
    // As in production: one triage call per inbox of up to 25 emails, each
    // mixing spam with legitimate mail, so a verdict can't lean on the
    // inbox being all one kind.
    const predictions = new Map<string, SpamPrediction>();
    for (const inbox of mixedSpamInboxes(SPAM_CASES, TRIAGE_CHUNK_SIZE)) {
      const verdicts = new Map((await classifySpam(inbox.map((c) => toParsedEmail(c)))).map((v) => [v.id, v]));
      for (const c of inbox) {
        const v = verdicts.get(c.id);
        predictions.set(c.id, v ? { isSpam: v.isSpam, reason: v.reason } : { isSpam: false, reason: null });
      }
    }
    const score = scoreSpam(SPAM_CASES, predictions);
    console.log(formatSpamScore(`${MODEL} (mixed inboxes)`, score));
    expectSpamScore(score);
  });

  it("sorts the briefing into the right buckets and knows what is due today", async () => {
    const predictions = new Map<string, BucketPrediction>();
    for (const f of BUCKET_FIXTURES) {
      const emails = f.emails.map((e, i) => toParsedEmail(e, `${f.id}-${i}`));
      const triage = await triageToday(emails, { language: f.language, now: f.now });
      for (const item of triage?.items ?? []) predictions.set(item.id, { bucket: item.bucket, dueDate: item.dueDate });
    }
    const score = scoreBuckets(BUCKET_FIXTURES, predictions);
    console.log(formatBucketScore(MODEL, score));

    expect(score.bucketAccuracy).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.bucketAccuracy);
    expect(score.dueTodayAccuracy).toBeGreaterThanOrEqual(MODEL_THRESHOLDS.dueTodayAccuracy);
  });

  it("summarizes what matters, in the right language, without links or injected text", async () => {
    const summaries = new Map<string, string | null>();
    for (const f of SUMMARY_FIXTURES) {
      const triage = await triageToday(
        f.emails.map((e, i) => toParsedEmail(e, `${f.id}-${i}`)),
        { language: f.language, now: "Thursday, 2026-09-24, 09:30 (UTC)" }
      );
      // Scored on the model's own words: each item's action line and date.
      summaries.set(f.id, triage ? triage.items.map((item) => `${item.action} ${item.due}`).join("\n") : null);
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
