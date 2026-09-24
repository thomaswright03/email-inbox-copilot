import { describe, it, expect } from "vitest";
import { heuristicSpamScore } from "../ai";
import type { ParsedEmail } from "../gmail";

function email(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    id: "1",
    threadId: "1",
    from: "sender@example.com",
    subject: "Hello",
    snippet: "Just checking in",
    date: "",
    listUnsubscribe: null,
    listUnsubscribePost: null,
    isInInbox: true,
    ...overrides,
  };
}

describe("heuristicSpamScore", () => {
  it("scores a plain, quiet message as 0", () => {
    expect(heuristicSpamScore(email())).toBe(0);
  });

  it("adds a point for a long all-caps subject line", () => {
    expect(heuristicSpamScore(email({ subject: "PLEASE READ THIS NOW" }))).toBe(1);
  });

  it("does not flag a short all-caps subject (e.g. an acronym)", () => {
    expect(heuristicSpamScore(email({ subject: "ASU" }))).toBe(0);
  });

  it("adds a point for the presence of a List-Unsubscribe header", () => {
    expect(heuristicSpamScore(email({ listUnsubscribe: "<https://example.com/unsub>" }))).toBe(1);
  });

  it("adds a point per matched spam keyword in subject or snippet", () => {
    expect(
      heuristicSpamScore(
        email({ subject: "50% off everything", snippet: "Act now, this is a limited time offer" })
      )
    ).toBe(3); // "% off", "act now", "limited time"
  });

  it("matches keywords case-insensitively", () => {
    expect(heuristicSpamScore(email({ subject: "You are a WINNER!" }))).toBe(1);
  });

  it("stacks multiple signals into a single score", () => {
    const score = heuristicSpamScore(
      email({
        subject: "CONGRATULATIONS YOU WON",
        snippet: "Click here to verify your account now, risk-free",
        listUnsubscribe: "<mailto:unsub@example.com>",
      })
    );
    // all-caps (1) + listUnsubscribe (1) + congratulations/click here/verify your account/risk-free (4)
    expect(score).toBe(6);
  });
});

describe("spam classification", () => {
  const promo = (id: string) => email({ id, subject: "50% off", listUnsubscribe: "<https://x.example/u>" });

  it("offers every heuristic candidate for checking, strongest first (no per-load cut here)", async () => {
    const { spamCandidates } = await import("../ai");
    const emails = [
      ...Array.from({ length: 30 }, (_, i) => promo(`p${i}`)),
      email({ id: "loud", subject: "LIMITED TIME: 50% OFF, ACT NOW", listUnsubscribe: "<https://x.example/u>" }),
      email({ id: "quiet", subject: "Lunch?" }),
    ];
    const candidates = spamCandidates(emails);
    expect(candidates).toHaveLength(31);
    expect(candidates[0].id).toBe("loud");
  });

  it("stops starting new batches once its time budget is spent, and reports the calls made", async () => {
    const { __setModelForTests, classifyCandidates } = await import("../ai");
    __setModelForTests(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return JSON.stringify({ isSpam: true, reason: "marketing" });
    });
    try {
      const result = await classifyCandidates(Array.from({ length: 12 }, (_, i) => promo(`p${i}`)), { timeBudgetMs: 0 });
      // The first batch of 5 always runs; nothing after the budget.
      expect(result).toMatchObject({ attempted: 5, error: null });
      expect(result.checkedIds).toHaveLength(5);
      expect(result.verdicts.every((v) => v.isSpam && v.reason === "marketing")).toBe(true);
    } finally {
      __setModelForTests(null);
    }
  });

  it("reports a failed model call instead of throwing, with the calls already made", async () => {
    const { __setModelForTests, classifyCandidates } = await import("../ai");
    let n = 0;
    __setModelForTests(async () => {
      if (++n === 7) throw new Error("Gemini down");
      return n === 2 ? "not json" : JSON.stringify({ isSpam: false, reason: "legitimate" });
    });
    try {
      const result = await classifyCandidates(Array.from({ length: 12 }, (_, i) => promo(`p${i}`)));
      expect(result.attempted).toBe(10);
      expect(result.error).toBeInstanceOf(Error);
      // The first batch finished: 5 checked, one of them with an unusable answer.
      expect(result.checkedIds).toHaveLength(5);
      expect(result.verdicts).toHaveLength(4);
    } finally {
      __setModelForTests(null);
    }
  });
});
