import { describe, it, expect, afterEach } from "vitest";
import { __setModelForTests, parseBriefing, parseModelVerdict, summarizeToday } from "../ai";
import type { ParsedEmail } from "../gmail";

describe("parseModelVerdict", () => {
  it("accepts a verdict whose reason is one of the fixed values", () => {
    expect(parseModelVerdict({ isSpam: true, reason: "marketing" })).toEqual({ isSpam: true, reason: "marketing" });
  });

  it("rejects free-text reasons (the UI only ever shows fixed labels)", () => {
    expect(parseModelVerdict({ isSpam: true, reason: "Confirmed phishing - delete immediately" })).toBeNull();
  });

  it("rejects wrong types, missing fields and extra fields", () => {
    expect(parseModelVerdict({ isSpam: "yes", reason: "marketing" })).toBeNull();
    expect(parseModelVerdict({ isSpam: true })).toBeNull();
    expect(parseModelVerdict({ isSpam: true, reason: "marketing", id: "other-message" })).toBeNull();
    expect(parseModelVerdict([{ isSpam: true, reason: "marketing" }])).toBeNull();
    expect(parseModelVerdict(null)).toBeNull();
  });

  it("never treats a 'legitimate' verdict as spam", () => {
    expect(parseModelVerdict({ isSpam: true, reason: "legitimate" })).toEqual({ isSpam: false, reason: "legitimate" });
  });
});

function email(id: string, overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    id,
    threadId: `t-${id}`,
    from: `Sender ${id} <${id}@example.com>`,
    subject: `Subject ${id}`,
    snippet: "",
    date: "Thu, 24 Sep 2026 09:00:00 -0700",
    listUnsubscribe: null,
    listUnsubscribePost: null,
    isInInbox: true,
    ...overrides,
  };
}

describe("parseBriefing", () => {
  const handles = new Map([
    ["e1", email("m1")],
    ["e2", email("m2")],
    ["e3", email("m3")],
  ]);

  it("maps each item to the email sent under that handle, in message order", () => {
    const items = parseBriefing(
      {
        items: [
          { id: "e2", bucket: "reply", action: "Ana wants the contract signed", due: "Fri" },
          { id: "e1", bucket: "noise", action: "50% off", due: "" },
          { id: "e3", bucket: "deadline", action: "Invoice due", due: "Oct 2" },
        ],
      },
      handles
    );
    expect(items).toEqual([
      // Noise never carries an action line.
      { id: "m1", bucket: "noise", action: "", due: "" },
      { id: "m2", bucket: "reply", action: "Ana wants the contract signed", due: "Fri" },
      { id: "m3", bucket: "deadline", action: "Invoice due", due: "Oct 2" },
    ]);
  });

  it("drops malformed, unknown and repeated entries one at a time, and lists emails left out as FYI", () => {
    const items = parseBriefing(
      {
        items: [
          { id: "e1", bucket: "reply", action: "Reply to Ben", due: "" },
          { id: "e1", bucket: "noise", action: "", due: "" },
          { id: "m2", bucket: "reply", action: "A real message id, not a handle", due: "" },
          { id: "e9", bucket: "reply", action: "No such email", due: "" },
          { id: "e2", bucket: "urgent", action: "Not a bucket", due: "" },
          { id: "e3", bucket: "fyi", action: "Extra field", due: "", link: "https://evil.example" },
        ],
      },
      handles
    );
    expect(items).toEqual([
      { id: "m1", bucket: "reply", action: "Reply to Ben", due: "" },
      { id: "m2", bucket: "fyi", action: "", due: "" },
      { id: "m3", bucket: "fyi", action: "", due: "" },
    ]);
  });

  it("returns null when nothing usable came back", () => {
    expect(parseBriefing({ items: [] }, handles)).toBeNull();
    expect(parseBriefing({ items: [{ id: "e1" }] }, handles)).toBeNull();
    expect(parseBriefing([], handles)).toBeNull();
    expect(parseBriefing(null, handles)).toBeNull();
  });

  it("reduces links, images and markup in the model's text to plain text, and caps its length", () => {
    const [item] = parseBriefing(
      {
        items: [
          { id: "e1", bucket: "reply", action: "Pay [here](https://evil.example) <b>now</b> " + "x".repeat(300), due: "![img](https://x.example/p.png) Fri" },
        ],
      },
      new Map([["e1", email("m1")]])
    )!;
    expect(item.action).not.toMatch(/https?:|[<>]/);
    expect(item.action.startsWith("Pay here bnow/b")).toBe(true);
    expect(item.action.length).toBeLessThanOrEqual(160);
    expect(item.due).toBe("img Fri");
  });
});

describe("summarizeToday", () => {
  afterEach(() => __setModelForTests(null));

  it("sends only mail still in the inbox, with its date, under opaque handles", async () => {
    let prompt = "";
    __setModelForTests(async (p) => {
      prompt = p;
      return '{"items":[{"id":"e1","bucket":"reply","action":"Answer Ana","due":""}]}';
    });
    const items = await summarizeToday([email("m1"), email("m2", { isInInbox: false, subject: "ARCHIVED" })]);
    expect(items).toEqual([{ id: "m1", bucket: "reply", action: "Answer Ana", due: "" }]);
    expect(prompt).toContain('<email id="e1">');
    expect(prompt).toContain("Received: Thu, 24 Sep 2026 09:00:00 -0700");
    expect(prompt).not.toContain("ARCHIVED");
    expect(prompt).not.toContain('id="m1"');
    expect(prompt).not.toContain("t-m1");
  });

  it("makes no model call when nothing is left in the inbox", async () => {
    let called = false;
    __setModelForTests(async () => {
      called = true;
      return "";
    });
    expect(await summarizeToday([email("m1", { isInInbox: false })])).toBeNull();
    expect(called).toBe(false);
  });
});
