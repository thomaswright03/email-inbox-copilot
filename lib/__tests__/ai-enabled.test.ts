import { describe, it, expect, vi, afterEach } from "vitest";
import { aiEnabled } from "../ai";

describe("aiEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off without an API key", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(aiEnabled()).toBe(false);
  });

  it("runs with just an API key while the paid-tier check is off (the default)", () => {
    vi.stubEnv("GEMINI_REQUIRE_PAID_TIER", "");
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    expect(aiEnabled()).toBe(true);
  });

  it("with GEMINI_REQUIRE_PAID_TIER=true, needs the paid project attested", () => {
    vi.stubEnv("GEMINI_REQUIRE_PAID_TIER", "true");
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "");
    expect(aiEnabled()).toBe(false);
    vi.stubEnv("GEMINI_PAID_TIER_PROJECT", "paid-project");
    expect(aiEnabled()).toBe(true);
  });
});
