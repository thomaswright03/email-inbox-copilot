import { describe, it, expect } from "vitest";
import { parseModelVerdict } from "../ai";

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
