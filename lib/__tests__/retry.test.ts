import { describe, it, expect, vi } from "vitest";
import { isTransientError, retryAfterMs, withRetry } from "../retry";

function httpError(status: number, headers: Record<string, string> = {}) {
  return Object.assign(new Error(`HTTP ${status}`), { status, response: { status, headers } });
}

describe("isTransientError", () => {
  it.each([429, 500, 502, 503, 504])("retries HTTP %i", (status) => {
    expect(isTransientError(httpError(status))).toBe(true);
  });

  it.each([400, 401, 403, 404])("does not retry HTTP %i", (status) => {
    expect(isTransientError(httpError(status))).toBe(false);
  });

  it("retries a network reset", () => {
    expect(isTransientError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }))).toBe(true);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs(httpError(429, { "retry-after": "2" }))).toBe(2000);
    const now = Date.parse("2026-09-24T00:00:00Z");
    expect(retryAfterMs(httpError(503, { "retry-after": "Thu, 24 Sep 2026 00:00:05 GMT" }), now)).toBe(5000);
    expect(retryAfterMs(httpError(503))).toBeNull();
  });
});

describe("withRetry", () => {
  const sleep = vi.fn(async () => {});

  it("retries a transient failure and returns the eventual result", async () => {
    const fn = vi.fn().mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce("ok");
    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a permanent failure", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(403));
    await expect(withRetry(fn, { sleep })).rejects.toThrow("HTTP 403");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("stops after the attempt limit", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(500));
    await expect(withRetry(fn, { attempts: 3, sleep })).rejects.toThrow("HTTP 500");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up rather than wait past the time budget", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(429, { "retry-after": "60" }));
    await expect(withRetry(fn, { budgetMs: 8000, sleep })).rejects.toThrow("HTTP 429");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
