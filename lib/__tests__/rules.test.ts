import { describe, it, expect } from "vitest";
import { ruleBasedGroups, ruleBasedSpamVerdicts } from "../rules";
import type { ParsedEmail } from "../gmail";

function email(overrides: Partial<ParsedEmail>): ParsedEmail {
  return {
    id: "m1",
    threadId: "t1",
    from: '"Alice" <alice@example.com>',
    subject: "Lunch on Friday?",
    snippet: "Are you free",
    date: "2026-09-24",
    listUnsubscribe: null,
    listUnsubscribePost: null,
    isInInbox: true,
    ...overrides,
  };
}

describe("ruleBasedGroups", () => {
  it("returns empty groups when there is nothing to summarize", () => {
    expect(ruleBasedGroups([])).toEqual({ toCheck: [], bulk: [] });
  });

  it("separates ordinary messages from likely bulk mail", () => {
    const groups = ruleBasedGroups([
      email({}),
      email({ id: "m2", from: "Shop <deals@shop.example>", subject: "Sale", listUnsubscribe: "<https://shop.example/u>" }),
    ]);
    expect(groups).toEqual({ toCheck: ["m1"], bulk: ["m2"] });
  });
});

describe("ruleBasedSpamVerdicts", () => {
  it("flags only inbox messages with at least two spam signals", () => {
    const verdicts = ruleBasedSpamVerdicts([
      email({ id: "plain" }),
      email({ id: "one-signal", listUnsubscribe: "<https://x.example/u>" }),
      email({ id: "junked", subject: "WINNER WINNER", snippet: "congratulations", isInInbox: false }),
      email({ id: "phish", subject: "Congratulations winner", snippet: "verify your account now" }),
    ]);
    expect(verdicts).toEqual([{ id: "phish", isSpam: true, reason: "phishing_pattern" }]);
  });
});

describe("the reason a rule-based flag shows", () => {
  const U = "<https://list.example/u>";
  // Examples written separately from the golden set in evals/golden/spam.ts.
  it.each([
    ["an obvious sale, even with an unsubscribe header", "LIMITED TIME: 50% OFF EVERYTHING", "Act now, this weekend only", "marketing"],
    ["a discount code", "A little something for you", "Use code AUTUMN15 at checkout for 15% off", "marketing"],
    ["an all-caps shout", "DON'T MISS THIS", "Our biggest event of the year starts now", "marketing"],
    ["a free-trial pitch", "Try Premium", "Start your free trial today, cancel anytime", "marketing"],
    ["a digest", "The Friday digest", "Five links worth your time", "newsletter"],
    ["a numbered issue", "Issue 88 is out", "Stories from the community", "newsletter"],
    ["a weekly roundup", "Your weekly roundup", "What happened in the team spaces", "newsletter"],
    ["bulk mail with no other clue", "A note from us", "Thanks for reading", "newsletter"],
    ["a prize scam", "You were selected!", "Claim your prize before midnight", "phishing_pattern"],
    ["an account scare", "Unusual activity", "Verify your account or it will be suspended", "phishing_pattern"],
  ])("%s", async (_, subject, snippet, reason) => {
    const { ruleBasedReason } = await import("../rules");
    expect(ruleBasedReason(email({ subject, snippet, listUnsubscribe: U }))).toBe(reason);
  });

  it("calls bulk mail without an unsubscribe header marketing", async () => {
    const { ruleBasedReason } = await import("../rules");
    expect(ruleBasedReason(email({ subject: "A note from us", snippet: "Thanks for reading" }))).toBe("marketing");
  });
});
