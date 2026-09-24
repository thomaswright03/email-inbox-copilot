// When the daily AI budget comes back, in the reader's language and time
// zone: "4:00 PM", or "1:00 AM tomorrow" when that is after local midnight.
export function formatResetTime(iso: string, locale: string, now = new Date()): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(at);
  if (at.toDateString() === now.toDateString()) return time;
  const tomorrow = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(1, "day");
  return `${time} ${tomorrow}`;
}
