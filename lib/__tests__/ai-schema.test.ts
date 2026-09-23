import { describe, it, expect, vi } from "vitest";
import { parseSpamVerdicts } from "../ai";

describe("parseSpamVerdicts", () => {
  it("accepts a well-formed array", () => {
    const raw = [{ id: "1", isSpam: true, reason: "marketing" }];
    expect(parseSpamVerdicts(raw)).toEqual(raw);
  });

  it("returns an empty array for non-array input", () => {
    expect(parseSpamVerdicts({ id: "1", isSpam: true, reason: "x" })).toEqual([]);
    expect(parseSpamVerdicts(null)).toEqual([]);
    expect(parseSpamVerdicts("not an array")).toEqual([]);
  });

  it("drops an entry with a wrong-typed field but keeps the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = [
      { id: "1", isSpam: true, reason: "ok" },
      { id: "2", isSpam: "yes", reason: "bad type" }, // isSpam should be boolean
      { id: 3, isSpam: false, reason: "id should be string" },
    ];
    expect(parseSpamVerdicts(raw)).toEqual([{ id: "1", isSpam: true, reason: "ok" }]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("drops an entry missing a required field", () => {
    const raw = [{ id: "1", isSpam: true }]; // missing reason
    expect(parseSpamVerdicts(raw)).toEqual([]);
  });
});
