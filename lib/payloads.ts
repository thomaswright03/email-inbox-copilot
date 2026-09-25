// Response shapes of the dashboard's API routes, shared with the client.
import type { BriefingItem } from "./ai";
import type { RuleGroups } from "./rules";
import type { SpamReason } from "./spam-reasons";

// "generated": written by Gemini. "off": AI features are not enabled
// (lib/ai.ts aiEnabled). "unavailable": AI is on but failed, so the
// rule-based view is shown instead. "budget": AI is on but today's AI
// budget is used up until `aiResetsAt` (lib/rate-limit.ts), so the
// rule-based view is shown instead.
export type AiStatus = "generated" | "off" | "unavailable" | "budget";

export type TodayPayload = {
  aiStatus: AiStatus;
  // When the daily AI budget resets (ISO time), with aiStatus "budget".
  aiResetsAt?: string;
  // The Actionable Briefing (lib/triage.ts): one item per email in the
  // inbox, newest first. null when it wasn't written; `groups` is the
  // rule-based view then.
  briefing: BriefingItem[] | null;
  groups: RuleGroups | null;
  generatedAt: string;
  // The user's local date (YYYY-MM-DD, lib/local-day.ts) the list covers,
  // which is what "due today" is measured against.
  localDate: string;
  count: number;
  truncated: boolean;
  totalEstimate: number;
  emails: { id: string; threadId: string; from: string; subject: string; date: string }[];
};

// How the card's Unsubscribe button works (lib/unsubscribe.ts).
export type CardUnsubscribe =
  | { kind: "one-click" }
  | { kind: "link"; url: string }
  | { kind: "mailto"; composeUrl: string }
  | null;

export type SpamCardPayload = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  reason: SpamReason;
  unsubscribe: CardUnsubscribe;
};

export type SpamPayload = {
  aiStatus: AiStatus;
  generatedAt: string;
  flashcards: SpamCardPayload[];
  // When the daily AI budget resets (ISO time), with aiStatus "budget".
  aiResetsAt?: string;
};

export type ActionName = "delete" | "unsubscribe" | "ignore" | "done" | "snooze" | "undo_delete" | "undo_archive" | "undo_ignore";

export type ActionResult =
  | { ok: true; archived?: boolean; warning?: "archive_failed" }
  | { ok: false; code: string; error: string };
