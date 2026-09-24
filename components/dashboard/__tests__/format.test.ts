import { describe, it, expect } from "vitest";
import { formatResetTime } from "../format";

describe("formatResetTime", () => {
  it("shows just the time when the reset is later today, and adds 'tomorrow' otherwise", () => {
    const now = new Date(2026, 8, 24, 10, 0);
    expect(formatResetTime(new Date(2026, 8, 24, 17, 0).toISOString(), "en", now)).toMatch(/^5:00\sPM$/);
    expect(formatResetTime(new Date(2026, 8, 25, 1, 0).toISOString(), "en", now)).toMatch(/^1:00\sAM tomorrow$/);
    expect(formatResetTime(new Date(2026, 8, 25, 1, 0).toISOString(), "fr", now)).toBe("01:00 demain");
    expect(formatResetTime(new Date(2026, 8, 25, 1, 0).toISOString(), "es", now)).toMatch(/mañana$/);
    expect(formatResetTime("not a date", "en", now)).toBe("");
  });
});
