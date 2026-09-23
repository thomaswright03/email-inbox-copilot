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
