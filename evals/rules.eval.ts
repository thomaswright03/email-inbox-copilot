// Scores the rule-based spam flags (lib/rules.ts), which is what users see
// whenever AI is off or unavailable. Runs offline: `npm run eval:rules`.
import { describe, expect, it } from "vitest";
import { ruleBasedSpamVerdicts } from "@/lib/rules";
import { SPAM_CASES } from "./golden/spam";
import { formatSpamScore, RULES_THRESHOLDS, scoreSpam, toParsedEmail, type SpamPrediction } from "./scoring";

describe("rule-based spam flags against the golden set", () => {
  it(`meet the floor in evals/scoring.ts`, () => {
    const verdicts = ruleBasedSpamVerdicts(SPAM_CASES.map((c) => toParsedEmail(c)));
    const predictions = new Map<string, SpamPrediction>(verdicts.map((v) => [v.id, { isSpam: v.isSpam, reason: v.reason }]));
    const score = scoreSpam(SPAM_CASES, predictions);
    console.log(formatSpamScore("Rules", score));

    expect(score.accuracy).toBeGreaterThanOrEqual(RULES_THRESHOLDS.spamAccuracy);
    expect(score.precision).toBeGreaterThanOrEqual(RULES_THRESHOLDS.spamPrecision);
    expect(score.recall).toBeGreaterThanOrEqual(RULES_THRESHOLDS.spamRecall);
    expect(score.reasonAccuracy).toBeGreaterThanOrEqual(RULES_THRESHOLDS.reasonAccuracy);
  });
});
