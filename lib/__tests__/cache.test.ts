import { describe, it, expect, vi, afterEach } from "vitest";
import { getCached, setCached, invalidateCached } from "../cache";

describe("cache", () => {
  afterEach(() => vi.useRealTimers());

  it("returns undefined for a key that was never set", () => {
    expect(getCached("nonexistent-key")).toBeUndefined();
  });

  it("returns a cached value before it expires", () => {
    setCached("k1", { hello: "world" }, 1000);
    expect(getCached("k1")).toEqual({ hello: "world" });
  });

  it("expires a value after its TTL passes", () => {
    vi.useFakeTimers();
    setCached("k2", "value", 1000);
    expect(getCached("k2")).toBe("value");
    vi.advanceTimersByTime(1001);
    expect(getCached("k2")).toBeUndefined();
  });

  it("invalidateCached removes a value immediately", () => {
    setCached("k3", "value", 60_000);
    expect(getCached("k3")).toBe("value");
    invalidateCached("k3");
    expect(getCached("k3")).toBeUndefined();
  });
});
