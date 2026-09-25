import type { BriefingBucket, BriefingItem } from "@/lib/ai";
import type { Translate } from "@/lib/i18n/translate";

// The buckets shown open, in order; Noise is collapsed below them.
export const OPEN_BUCKETS = ["reply", "deadline", "fyi"] as const satisfies readonly BriefingBucket[];

// Due today in the user's own time zone: the model's due date (YYYY-MM-DD,
// worked out against the user's local date) is the local date the list
// covers (TodayPayload.localDate).
export function isDueToday(item: BriefingItem, localDate: string): boolean {
  return Boolean(item.dueDate) && item.dueDate === localDate;
}

export type BriefingCounts = { reply: number; deadlineToday: number; deadlineLater: number; fyi: number };

// What the header counts: the items still showing (not Done, not snoozed).
export function briefingCounts(items: readonly BriefingItem[], localDate: string): BriefingCounts {
  const counts: BriefingCounts = { reply: 0, deadlineToday: 0, deadlineLater: 0, fyi: 0 };
  for (const item of items) {
    if (item.bucket === "reply") counts.reply++;
    else if (item.bucket === "fyi") counts.fyi++;
    else if (item.bucket === "deadline") {
      if (isDueToday(item, localDate)) counts.deadlineToday++;
      else counts.deadlineLater++;
    }
  }
  return counts;
}

// "3 need a reply · 1 deadline today · 14 FYI". Empty parts are left out;
// deadlines that aren't due today are counted apart ("2 more deadlines"),
// or as plain "deadlines" when none is due today.
export function briefingHeadline(counts: BriefingCounts, t: Translate): string {
  const parts: string[] = [];
  if (counts.reply > 0) parts.push(t("briefing.count.reply", { count: counts.reply }));
  if (counts.deadlineToday > 0) parts.push(t("briefing.count.deadlineToday", { count: counts.deadlineToday }));
  if (counts.deadlineLater > 0) {
    parts.push(t(counts.deadlineToday > 0 ? "briefing.count.deadlineMore" : "briefing.count.deadline", { count: counts.deadlineLater }));
  }
  if (counts.fyi > 0) parts.push(t("briefing.count.fyi", { count: counts.fyi }));
  return parts.join(" · ");
}
