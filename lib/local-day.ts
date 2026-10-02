// "Today" is the user's calendar day, in the time zone their browser
// reports, not a rolling 24 hours or the UTC date. The dashboard sends its
// zone as `?tz=` (an IANA name such as "America/Los_Angeles"); anything
// missing or unknown falls back to UTC.
export type LocalDay = {
  timeZone: string;
  // The local date, YYYY-MM-DD (part of the cache keys, so they roll over
  // at the user's midnight).
  date: string;
  // The local midnight that started the day, in Unix seconds (Gmail's
  // `after:` search operator takes seconds).
  startSeconds: number;
};

const TIME_ZONE_PATTERN = /^[A-Za-z0-9_+\-/]{1,64}$/;

export function resolveTimeZone(raw: string | null | undefined): string {
  if (!raw || !TIME_ZONE_PATTERN.test(raw)) return "UTC";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// The zone's wall-clock fields at `at`.
function wallClock(at: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// How far the zone's wall clock is ahead of UTC at `at`, in ms.
function offsetMs(at: number, timeZone: string): number {
  const w = wallClock(at, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(at / 1000) * 1000;
}

export function localDay(timeZone: string, now: Date = new Date()): LocalDay {
  const { year, month, day } = wallClock(now.getTime(), timeZone);
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Midnight as if it were UTC, corrected by the zone's offset; the second
  // pass settles days whose offset changes overnight (daylight saving).
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  let start = midnightAsUtc - offsetMs(midnightAsUtc, timeZone);
  start = midnightAsUtc - offsetMs(start, timeZone);
  // Never later than now (a zone whose clocks skip midnight itself).
  start = Math.min(start, now.getTime());
  return { timeZone, date, startSeconds: Math.floor(start / 1000) };
}

export function localDayFrom(req: Request, now?: Date): LocalDay {
  return localDay(resolveTimeZone(new URL(req.url).searchParams.get("tz")), now);
}

// The user's current local date and time, for the triage prompt, so the
// model can turn "Friday" or "tomorrow" in an email into a calendar date:
// "Thursday, 2026-09-24, 14:05 (America/Los_Angeles)".
export function describeNow(timeZone: string, now: Date = new Date()): string {
  const w = wallClock(now.getTime(), timeZone);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "long" }).format(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${weekday}, ${w.year}-${pad(w.month)}-${pad(w.day)}, ${pad(w.hour)}:${pad(w.minute)} (${timeZone})`;
}
