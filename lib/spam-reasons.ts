// The only reasons a spam card can show. The model must pick one of these
// keys (enforced by the response schema and zod); the UI shows the fixed
// label, never text the model wrote.
export const SPAM_REASONS = ["marketing", "newsletter", "cold_outreach", "phishing_pattern", "legitimate"] as const;
export type SpamReason = (typeof SPAM_REASONS)[number];

export const SPAM_REASON_LABEL: Record<SpamReason, string> = {
  marketing: "Looks like marketing or a promotion",
  newsletter: "Looks like a newsletter or bulk mailing",
  cold_outreach: "Looks like unsolicited cold outreach",
  phishing_pattern: "Has patterns common in phishing",
  legitimate: "Looks legitimate",
};
