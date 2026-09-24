import { describe, it, expect, vi, afterEach } from "vitest";
import { FETCH_TIMEOUT_MS, fetchJson } from "../client-fetch";

describe("fetchJson", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives up on a request that never answers and reports a timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const pending = fetchJson("/api/emails/today");
    await vi.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ ok: false, status: 0, code: "timeout" });
  });

  it("also times out while the body is still arriving", async () => {
    vi.useFakeTimers();
    const res = { ok: true, status: 200, json: () => new Promise(() => {}) } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn(async () => res));
    const pending = fetchJson("/api/emails/today", undefined, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ ok: false, status: 200, code: "timeout" });
  });

  it("tells a dropped connection from an API error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await fetchJson("/x")).toEqual({ ok: false, status: 0, code: "network" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, code: "rate_limited" }), { status: 429 })));
    expect(await fetchJson("/x")).toEqual({ ok: false, status: 429, code: "rate_limited" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, n: 1 }), { status: 200 })));
    expect(await fetchJson("/x")).toEqual({ ok: true, status: 200, data: { ok: true, n: 1 } });
  });
});
