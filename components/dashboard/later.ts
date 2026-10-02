// Snooze and Remind me for briefing items. Gmail's API has no snooze, and
// Inbox Buddy doesn't store anything new about the user's mail on its
// server, so both live in this browser: localStorage, one entry per Gmail
// message, keyed per signed-in account. An entry holds only Gmail's opaque
// message and thread ids and a time, never a sender, subject or preview.
//
// Snooze hides the item until `until`; Remind me leaves it where it is.
// Once `until` has passed, either kind is "due": the item is highlighted
// (or, if it is no longer in today's list, a banner links it in Gmail)
// until the user dismisses it or marks it Done.

export type LaterKind = "snooze" | "remind";
export type LaterEntry = {
  kind: LaterKind;
  // When it comes back (epoch ms).
  until: number;
  threadId: string;
  // A browser notification has been shown for it.
  notified?: boolean;
};
export type LaterMap = Readonly<Record<string, LaterEntry>>;

export const LATER_CHOICES = ["laterToday", "tomorrow", "nextWeek"] as const;
export type LaterChoice = (typeof LATER_CHOICES)[number];

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MORNING_HOUR = 9;
// Due entries nobody dismissed are forgotten after this long.
const KEEP_DUE_MS = 7 * DAY;

// When each choice comes back, in the browser's own time zone: later today
// is three hours from now, tomorrow morning is 9:00 tomorrow, and next week
// is 9:00 next Monday (a week from today when today is Monday).
export function laterTime(choice: LaterChoice, now: Date = new Date()): number {
  if (choice === "laterToday") return now.getTime() + 3 * HOUR;
  const next = new Date(now);
  next.setHours(MORNING_HOUR, 0, 0, 0);
  if (choice === "tomorrow") {
    next.setDate(next.getDate() + 1);
  } else {
    const daysToMonday = ((8 - next.getDay()) % 7) || 7;
    next.setDate(next.getDate() + daysToMonday);
  }
  return next.getTime();
}

export function isDue(entry: LaterEntry, now: number): boolean {
  return entry.until <= now;
}

// The ids of snoozed items that are still hidden.
export function snoozedIds(entries: LaterMap, now: number): Set<string> {
  return new Set(Object.entries(entries).flatMap(([id, e]) => (e.kind === "snooze" && !isDue(e, now) ? [id] : [])));
}

// When the next entry comes due, or null when none is waiting.
export function nextDueAt(entries: LaterMap, now: number): number | null {
  const waiting = Object.values(entries)
    .filter((e) => !isDue(e, now))
    .map((e) => e.until);
  return waiting.length ? Math.min(...waiting) : null;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function isEntry(value: unknown): value is LaterEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    (e.kind === "snooze" || e.kind === "remind") &&
    typeof e.until === "number" &&
    Number.isFinite(e.until) &&
    typeof e.threadId === "string" &&
    ID_PATTERN.test(e.threadId) &&
    (e.notified === undefined || typeof e.notified === "boolean")
  );
}

// Reads what was stored, keeping only well-formed entries (the storage is
// the user's own, but it is still input) that aren't long past due.
export function parseLater(raw: string | null, now: number = Date.now()): LaterMap {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  const out: Record<string, LaterEntry> = {};
  for (const [id, value] of Object.entries(data)) {
    if (!ID_PATTERN.test(id) || !isEntry(value) || now - value.until > KEEP_DUE_MS) continue;
    out[id] = { kind: value.kind, until: value.until, threadId: value.threadId, ...(value.notified ? { notified: true } : {}) };
  }
  return out;
}

export function laterStorageKey(accountId: string): string {
  return `inbox-buddy.later.${accountId}`;
}

// localStorage can be missing or throw (private windows, blocked site
// data); the entries then last only as long as the page.
const memory = new Map<string, string>();

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory.get(key) ?? null;
  }
}

export function writeStored(key: string, entries: LaterMap): void {
  const value = JSON.stringify(entries);
  try {
    if (Object.keys(entries).length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    memory.set(key, value);
  }
}
