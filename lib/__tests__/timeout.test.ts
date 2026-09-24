import { describe, it, expect, vi, afterEach } from "vitest";
import { deadlineSignal, TimeoutError, withTimeout } from "../timeout";
import { isTransientError } from "../retry";

describe("withTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("passes a result through and clears its timer", async () => {
    vi.useFakeTimers();
    await expect(withTimeout(async () => 42, 1000)).resolves.toBe(42);
    expect(vi.getTimerCount()).toBe(0);
    await expect(withTimeout(async () => Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
    await expect(
      withTimeout(() => {
        throw new Error("sync");
      }, 1000)
    ).rejects.toThrow("sync");
  });

  it("gives up after the timeout even when the call ignores its signal, and aborts the signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = withTimeout((s) => {
      signal = s;
      return new Promise(() => {});
    }, 1000);
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it("stops at a shared deadline, including one that has already passed", async () => {
    vi.useFakeTimers();
    const deadline = deadlineSignal(500);
    const pending = withTimeout(() => new Promise(() => {}), 10_000, deadline);
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(500);
    await assertion;
    await expect(withTimeout(async () => 1, 10_000, deadline)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("is a transient error, so reads retry it within their budget", () => {
    expect(isTransientError(new TimeoutError(10))).toBe(true);
  });
});
