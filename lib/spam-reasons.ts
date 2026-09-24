// The only reasons a spam card can show. The model must pick one of these
// keys (enforced by the response schema and zod); the UI shows the fixed,
// translated label for the key (spam.reason.* in lib/i18n/messages), never
// text the model wrote.
export const SPAM_REASONS = ["marketing", "newsletter", "cold_outreach", "phishing_pattern", "legitimate"] as const;
export type SpamReason = (typeof SPAM_REASONS)[number];
