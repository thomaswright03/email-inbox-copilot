// Response shapes of the dashboard's API routes, shared with the client.
import type { RuleGroups } from "./rules";
import type { SpamReason } from "./spam-reasons";

// "generated": written by Gemini. "off": AI features are not enabled
// (lib/ai.ts aiEnabled). "unavailable": AI is on but failed or is over its
// daily budget, so the rule-based view is shown instead.
export type AiStatus = "generated" | "off" | "unavailable";

export type TodayPayload = {
  aiStatus: AiStatus;
  summary: string | null;
  groups: RuleGroups | null;
  generatedAt: string;
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

export type SpamPayload = { aiStatus: AiStatus; generatedAt: string; flashcards: SpamCardPayload[] };

export type ActionName = "delete" | "unsubscribe" | "ignore" | "undo_delete" | "undo_archive" | "undo_ignore";

export type ActionResult =
  | { ok: true; archived?: boolean; warning?: "archive_failed" }
  | { ok: false; code: string; error: string };
