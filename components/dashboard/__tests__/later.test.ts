// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { laterStorageKey, laterTime, nextDueAt, parseLater, readStored, snoozedIds, writeStored, type LaterMap } from "../later";

const HOUR = 60 * 60 * 1000;

describe("laterTime", () => {
  // Thursday, Sept 24 2026, 14:30 in the browser's own zone.
  const thursday = new Date(2026, 8, 24, 14, 30);

  it("later today is three hours from now", () => {
    expect(laterTime("laterToday", thursday)).toBe(thursday.getTime() + 3 * HOUR);
  });

  it("tomorrow morning is 9:00 tomorrow", () => {
    expect(new Date(laterTime("tomorrow", thursday))).toEqual(new Date(2026, 8, 25, 9, 0));
  });

  it("next week is 9:00 next Monday, and a week later when today is Monday", () => {
    expect(new Date(laterTime("nextWeek", thursday))).toEqual(new Date(2026, 8, 28, 9, 0));
    expect(new Date(laterTime("nextWeek", new Date(2026, 8, 27, 20, 0)))).toEqual(new Date(2026, 8, 28, 9, 0));
    expect(new Date(laterTime("nextWeek", new Date(2026, 8, 28, 8, 0)))).toEqual(new Date(2026, 9, 5, 9, 0));
  });
});

describe("snoozed and due entries", () => {
  const now = Date.UTC(2026, 8, 24, 12);
  const entries: LaterMap = {
    waiting: { kind: "snooze", until: now + HOUR, threadId: "t1" },
    back: { kind: "snooze", until: now - HOUR, threadId: "t2" },
    remind: { kind: "remind", until: now + 2 * HOUR, threadId: "t3" },
  };

  it("hides only snoozes whose time hasn't come", () => {
    expect([...snoozedIds(entries, now)]).toEqual(["waiting"]);
  });

  it("wakes the page for the next entry to come due", () => {
    expect(nextDueAt(entries, now)).toBe(now + HOUR);
    expect(nextDueAt({ back: entries.back }, now)).toBeNull();
  });
});

describe("parseLater", () => {
  const now = Date.UTC(2026, 8, 24, 12);

  it("keeps well-formed entries only, and forgets ones long past due", () => {
    const raw = JSON.stringify({
      m1: { kind: "snooze", until: now + HOUR, threadId: "t1" },
      m2: { kind: "remind", until: now - HOUR, threadId: "t2", notified: true },
      m3: { kind: "delete", until: now, threadId: "t3" },
      m4: { kind: "snooze", until: "tomorrow", threadId: "t4" },
      m5: { kind: "snooze", until: now, threadId: "https://evil.example/" },
      "../x": { kind: "snooze", until: now, threadId: "t6" },
      m7: { kind: "remind", until: now - 8 * 24 * HOUR, threadId: "t7" },
      m8: { kind: "snooze", until: now, threadId: "t8", subject: "extra fields are dropped" },
    });
    expect(parseLater(raw, now)).toEqual({
      m1: { kind: "snooze", until: now + HOUR, threadId: "t1" },
      m2: { kind: "remind", until: now - HOUR, threadId: "t2", notified: true },
      m8: { kind: "snooze", until: now, threadId: "t8" },
    });
  });

  it("reads anything else as empty", () => {
    for (const raw of [null, "", "not json", "[]", "null", "42"]) expect(parseLater(raw, now)).toEqual({});
  });
});

describe("storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("keeps each account's entries apart, and holds only ids and times", () => {
    const entries: LaterMap = { m1: { kind: "snooze", until: 1, threadId: "t1" } };
    writeStored(laterStorageKey("gid-a"), entries);
    expect(readStored(laterStorageKey("gid-b"))).toBeNull();
    expect(JSON.parse(readStored(laterStorageKey("gid-a"))!)).toEqual(entries);
    writeStored(laterStorageKey("gid-a"), {});
    expect(window.localStorage.getItem(laterStorageKey("gid-a"))).toBeNull();
  });

  it("falls back to memory when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const entries: LaterMap = { m1: { kind: "remind", until: 5, threadId: "t1" } };
    expect(() => writeStored("k", entries)).not.toThrow();
    expect(JSON.parse(readStored("k")!)).toEqual(entries);
  });
});
