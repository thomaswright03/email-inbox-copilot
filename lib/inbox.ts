import { fetchRecentMessages, GmailAuthError, type InboxWindow } from "./gmail";
import { getOrSetCached, invalidateUserInbox, peekCached, userCacheKey } from "./response-cache";
import { RouteError } from "./route-error";
import { logError } from "./log";

// Both dashboard routes (summary and spam) need the same Gmail message
// list. It is read from Gmail once and cached per user for the same short
// TTL as the payloads, so one dashboard load makes one Gmail pass.
export const INBOX_CACHE_TTL_MS = 5 * 60 * 1000;

export type InboxRead = InboxWindow & { fetchedAt: string };

export async function readInbox(accessToken: string, userId: string, context: string): Promise<InboxRead> {
  try {
    return await getOrSetCached(userCacheKey("messages", userId), INBOX_CACHE_TTL_MS, async () => ({
      ...(await fetchRecentMessages(accessToken)),
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    if (err instanceof GmailAuthError) {
      throw new RouteError("Inbox Buddy has lost access to your Gmail. Reconnect to continue.", 403, "gmail_reconnect");
    }
    logError(`${context}.gmail`, err);
    throw new RouteError("Couldn't reach Gmail right now. Try again in a moment.", 502, "gmail_unavailable");
  }
}

// `?refresh=1` drops the route's own cached payload and, unless it was read
// in the last few seconds (the other tab's refresh just did), this user's
// cached message list, so Refresh re-reads Gmail once. Rate limits apply.
const FRESH_ENOUGH_MS = 15_000;

export async function maybeRefresh(req: Request, userId: string, kind: "today" | "spam"): Promise<void> {
  if (new URL(req.url).searchParams.get("refresh") !== "1") return;
  const cached = await peekCached<InboxRead>(userCacheKey("messages", userId));
  const age = cached ? Date.now() - Date.parse(cached.fetchedAt) : Infinity;
  await invalidateUserInbox(userId, age < FRESH_ENOUGH_MS ? [kind] : ["messages", kind]);
}
