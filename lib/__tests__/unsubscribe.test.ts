import { describe, it, expect } from "vitest";
import { parseUnsubscribeTargets } from "../unsubscribe";

describe("parseUnsubscribeTargets", () => {
  it("extracts an http(s) target when present", () => {
    const result = parseUnsubscribeTargets("<https://example.com/unsub?id=1>");
    expect(result.url).toBe("https://example.com/unsub?id=1");
    expect(result.mailto).toBeUndefined();
  });

  it("extracts a mailto target when that's the only option", () => {
    const result = parseUnsubscribeTargets("<mailto:unsub@example.com>");
    expect(result.mailto).toBe("mailto:unsub@example.com");
    expect(result.url).toBeUndefined();
  });

  it("prefers the http(s) target over mailto when a header lists both", () => {
    const result = parseUnsubscribeTargets(
      "<mailto:unsub@example.com>, <https://example.com/unsub?id=1>"
    );
    expect(result.url).toBe("https://example.com/unsub?id=1");
    expect(result.mailto).toBe("mailto:unsub@example.com");
  });

  it("handles multiple http targets by picking the first", () => {
    const result = parseUnsubscribeTargets(
      "<https://example.com/one>, <https://example.com/two>"
    );
    expect(result.url).toBe("https://example.com/one");
  });

  it("returns no targets for an empty or malformed header", () => {
    expect(parseUnsubscribeTargets("")).toEqual({ url: undefined, mailto: undefined });
    expect(parseUnsubscribeTargets("not a valid header")).toEqual({ url: undefined, mailto: undefined });
  });
});
