import { describe, it, expect } from "vitest";
import { localDay, localDayFrom, resolveTimeZone } from "../local-day";

describe("resolveTimeZone", () => {
  it("accepts IANA zone names and falls back to UTC for anything else", () => {
    expect(resolveTimeZone("America/Los_Angeles")).toBe("America/Los_Angeles");
    expect(resolveTimeZone("Not/AZone")).toBe("UTC");
    expect(resolveTimeZone("'; DROP TABLE")).toBe("UTC");
    expect(resolveTimeZone("x".repeat(65))).toBe("UTC");
    expect(resolveTimeZone(null)).toBe("UTC");
  });
});

describe("localDay", () => {
  it("starts the day at the user's midnight, not the UTC date", () => {
    // 7 pm on Sept 23 in Los Angeles is already Sept 24 in UTC.
    const now = new Date("2026-09-24T02:00:00Z");
    expect(localDay("America/Los_Angeles", now)).toEqual({
      timeZone: "America/Los_Angeles",
      date: "2026-09-23",
      startSeconds: Date.parse("2026-09-23T07:00:00Z") / 1000,
    });
    expect(localDay("UTC", now)).toEqual({ timeZone: "UTC", date: "2026-09-24", startSeconds: Date.parse("2026-09-24T00:00:00Z") / 1000 });
    expect(localDay("Asia/Kolkata", now).startSeconds).toBe(Date.parse("2026-09-23T18:30:00Z") / 1000);
  });

  it("handles days whose offset changes overnight (daylight saving)", () => {
    // US clocks go forward at 2 am on March 8, 2026: midnight was still PST.
    expect(localDay("America/Los_Angeles", new Date("2026-03-08T20:00:00Z")).startSeconds).toBe(
      Date.parse("2026-03-08T08:00:00Z") / 1000
    );
    // And back at 2 am on Nov 1, 2026: midnight was still PDT.
    expect(localDay("America/Los_Angeles", new Date("2026-11-01T20:00:00Z")).startSeconds).toBe(
      Date.parse("2026-11-01T07:00:00Z") / 1000
    );
  });

  it("reads the zone from ?tz=", () => {
    const now = new Date("2026-09-24T02:00:00Z");
    expect(localDayFrom(new Request("http://localhost/api/emails/today?tz=America%2FLos_Angeles"), now).date).toBe("2026-09-23");
    expect(localDayFrom(new Request("http://localhost/api/emails/today"), now)).toMatchObject({ timeZone: "UTC", date: "2026-09-24" });
  });
});
