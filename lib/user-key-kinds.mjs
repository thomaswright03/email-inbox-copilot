// The single list of per-user response_cache key kinds. Every per-user cache
// key is "<kind>:<google-account-id>:..." with <kind> from this list:
//
// - "messages", "today", "spam": today's inbox data (lib/response-cache.ts)
// - "triage": the model's briefing and spam verdicts for the day (lib/triage.ts)
// - "verdicts": AI spam verdicts per message (lib/verdict-cache.ts)
//
// Plain JavaScript so that both the app (lib/response-cache.ts, which only
// writes keys of these kinds and purges all of them at sign-out) and the
// operator's export/delete script (scripts/user-data.mjs) read the same list.
// A new kind added here is covered by all three; a kind the app writes that
// is missing here doesn't type-check (lib/response-cache.ts UserCacheKind).
export const USER_KEY_KINDS = /** @type {const} */ (["messages", "today", "spam", "triage", "verdicts"]);

/**
 * SQL LIKE patterns (backslash escapes) matching every response_cache key
 * that belongs to `googleId`, one per kind.
 * @param {string} googleId
 * @returns {string[]}
 */
export function userCacheKeyPatterns(googleId) {
  if (!googleId) throw new Error("userCacheKeyPatterns requires a user id");
  // Escape the LIKE wildcard characters an id may contain.
  const likeId = googleId.replace(/[\\%_]/g, (c) => `\\${c}`);
  return USER_KEY_KINDS.map((kind) => `${kind}:${likeId}:%`);
}
