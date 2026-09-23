import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../cache", () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
  invalidateCached: vi.fn(),
}));
vi.mock("../db-cache", () => ({
  getCachedDb: vi.fn(),
  setCachedDb: vi.fn(),
  invalidateCachedDb: vi.fn(),
}));

import { getCached, setCached, invalidateCached } from "../cache";
import { getCachedDb, setCachedDb, invalidateCachedDb } from "../db-cache";
import { getOrSetCached, invalidateCachedEverywhere } from "../response-cache";

describe("getOrSetCached", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the in-memory (L1) value without touching L2 or the fetcher", async () => {
    vi.mocked(getCached).mockReturnValue("l1-value");
    const fetcher = vi.fn();

    const result = await getOrSetCached("k", 1000, fetcher);

    expect(result).toBe("l1-value");
    expect(getCachedDb).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("falls back to the db (L2) cache on an L1 miss, and backfills L1", async () => {
    vi.mocked(getCached).mockReturnValue(undefined);
    vi.mocked(getCachedDb).mockResolvedValue("l2-value");
    const fetcher = vi.fn();

    const result = await getOrSetCached("k", 1000, fetcher);

    expect(result).toBe("l2-value");
    expect(fetcher).not.toHaveBeenCalled();
    expect(setCached).toHaveBeenCalledWith("k", "l2-value", 1000);
  });

  it("calls the fetcher on a full miss and populates both layers", async () => {
    vi.mocked(getCached).mockReturnValue(undefined);
    vi.mocked(getCachedDb).mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue("fresh-value");

    const result = await getOrSetCached("k", 1000, fetcher);

    expect(result).toBe("fresh-value");
    expect(setCached).toHaveBeenCalledWith("k", "fresh-value", 1000);
    expect(setCachedDb).toHaveBeenCalledWith("k", "fresh-value", 1000);
  });
});

describe("invalidateCachedEverywhere", () => {
  it("invalidates both cache layers", async () => {
    await invalidateCachedEverywhere("k");
    expect(invalidateCached).toHaveBeenCalledWith("k");
    expect(invalidateCachedDb).toHaveBeenCalledWith("k");
  });
});
