import { describe, it, expect } from "vitest";
import { SPAM_REASONS } from "../spam-reasons";
import { SPAM_CASES } from "@/evals/golden/spam";
import { SUMMARY_FIXTURES } from "@/evals/golden/summary";
import { formatSpamScore, scoreSpam, scoreSummaries, toParsedEmail } from "@/evals/scoring";

describe("golden sets (evals/golden)", () => {
  it("have at least 30 spam cases with valid, consistent labels and unique ids", () => {
    expect(SPAM_CASES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SPAM_CASES.map((c) => c.id)).size).toBe(SPAM_CASES.length);
    for (const c of SPAM_CASES) {
      expect(SPAM_REASONS).toContain(c.expected.reason);
      expect(c.expected.isSpam).toBe(c.expected.reason !== "legitimate");
    }
    for (const reason of SPAM_REASONS) {
      expect(SPAM_CASES.filter((c) => c.expected.reason === reason).length, reason).toBeGreaterThanOrEqual(4);
    }
  });

  it("use only invented addresses", () => {
    const addresses = [...SPAM_CASES, ...SUMMARY_FIXTURES.flatMap((f) => f.emails)].map((e) => e.from);
    for (const from of addresses) expect(from).toMatch(/@[\w.-]+\.example>?$/);
  });

  it("have several summary fixtures, each with must-mention items", () => {
    expect(SUMMARY_FIXTURES.length).toBeGreaterThanOrEqual(3);
    for (const f of SUMMARY_FIXTURES) {
      expect(f.mustMention.length).toBeGreaterThan(0);
      expect(f.mustNotContain).toContain("http");
    }
  });
});

describe("scoring", () => {
  const cases = SPAM_CASES.filter((c) => ["mk1", "co1", "lg1", "lg2"].includes(c.id));

  it("scores accuracy, precision, recall and reason accuracy", () => {
    const score = scoreSpam(
      cases,
      new Map([
        ["mk1", { isSpam: true, reason: "newsletter" as const }],
        ["lg1", { isSpam: true, reason: "marketing" as const }],
        ["lg2", { isSpam: false, reason: null }],
      ])
    );
    // mk1 right (wrong reason), co1 missed, lg1 false flag, lg2 right.
    expect(score).toMatchObject({ total: 4, accuracy: 0.5, precision: 0.5, recall: 0.5, reasonAccuracy: 0 });
    expect(score.mistakes.map((m) => m.id)).toEqual(["mk1", "co1", "lg1"]);
    expect(formatSpamScore("x", score)).toContain("accuracy 50.0%");
  });

  it("scores summary coverage and catches forbidden text", () => {
    const [workday, , injection] = SUMMARY_FIXTURES;
    const score = scoreSummaries(
      [workday, injection],
      new Map([
        ["workday", "- Ana needs contract comments by Thursday.\n- Billing is down tonight."],
        ["injection", "- Approve the budget. Visit https://evil.example/login"],
      ])
    );
    expect(score.coverage).toBe(1);
    expect(score.forbidden.map((f) => f.text)).toEqual(["http", "evil.example"]);
    expect(scoreSummaries([workday], new Map()).coverage).toBe(0);
  });

  it("turns a golden case into the email shape the app classifies", () => {
    expect(toParsedEmail(SPAM_CASES[0])).toMatchObject({ id: "mk1", isInInbox: true, listUnsubscribePost: null });
  });
});
