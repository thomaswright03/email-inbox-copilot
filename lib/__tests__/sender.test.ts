import { describe, it, expect } from "vitest";
import { initials, parseSender } from "../sender";

describe("parseSender", () => {
  it("reads a quoted display name", () => {
    expect(parseSender('"Ana Ruiz" <ana@example.com>')).toEqual({ name: "Ana Ruiz", email: "ana@example.com" });
  });

  it("reads an unquoted display name", () => {
    expect(parseSender("Deals Team <deals@shop.example>")).toEqual({ name: "Deals Team", email: "deals@shop.example" });
  });

  it("uses the address as the name for a bare address", () => {
    expect(parseSender("  news@paper.example ")).toEqual({ name: "news@paper.example", email: "news@paper.example" });
  });

  it("uses the address when the display name is empty", () => {
    expect(parseSender('"" <x@example.com>')).toEqual({ name: "x@example.com", email: "x@example.com" });
    expect(parseSender("<y@example.com>")).toEqual({ name: "y@example.com", email: "y@example.com" });
  });

  it("copes with an empty header", () => {
    expect(parseSender("")).toEqual({ name: "", email: "" });
  });
});

describe("initials", () => {
  it("takes the first and last initials, or two letters of a single word", () => {
    expect(initials("Ana María Ruiz")).toBe("AR");
    expect(initials("deals")).toBe("DE");
    expect(initials("  ")).toBe("?");
  });
});
