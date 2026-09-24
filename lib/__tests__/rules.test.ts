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
