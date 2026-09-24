import { describe, it, expect } from "vitest";
import { ruleBasedSummary, ruleBasedSpamVerdicts } from "../rules";
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
    isInInbox: true,
    ...overrides,
  };
}

describe("ruleBasedSummary", () => {
  it("says so when there is nothing to summarize", () => {
    expect(ruleBasedSummary([])).toBe("No messages received today.");
  });

  it("separates ordinary messages from likely bulk mail", () => {
    const out = ruleBasedSummary([
      email({}),
      email({ id: "m2", from: "Shop <deals@shop.example>", subject: "Sale", listUnsubscribe: "<https://shop.example/u>" }),
    ]);
    expect(out).toContain("Messages to check (1)");
    expect(out).toContain("**Alice**: Lunch on Friday?");
    expect(out).toContain("Likely promotional or bulk (1)");
  });

  it("escapes sender and subject so they can't form links, images or HTML", () => {
    const out = ruleBasedSummary([email({ subject: "[click](https://evil.example) ![x](https://evil.example/p.png) <b>" })]);
    expect(out).not.toMatch(/\]\(https/);
    expect(out).not.toContain("<b>");
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
