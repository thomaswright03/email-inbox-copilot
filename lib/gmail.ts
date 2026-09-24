import { google, gmail_v1 } from "googleapis";
import { toSafeError } from "./log";
import { withRetry } from "./retry";
import { deadlineSignal, withTimeout } from "./timeout";

export type ParsedEmail = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  listUnsubscribe: string | null;
  // "List-Unsubscribe=One-Click" when the sender supports RFC 8058
  // one-click unsubscribe (a POST to the List-Unsubscribe URL).
  listUnsubscribePost: string | null;
  isInInbox: boolean;
};

export type InboxWindow = {
  emails: ParsedEmail[];
  // More messages arrived in the window than MAX_MESSAGES; `emails` holds
  // the newest MAX_MESSAGES and `totalEstimate` is Gmail's estimate of all.
  truncated: boolean;
  totalEstimate: number;
};

// A rolling 24-hour window, newest first, up to this many messages.
export const MAX_MESSAGES = 100;
const PAGE_SIZE = 100;
const GET_CONCURRENCY = 10;

// GMAIL_API_ROOT_URL points the client at a stand-in Gmail API for the
// end-to-end tests (e2e/). It must never be set in a real deployment;
// instrumentation.ts raises an alert if it is set in production.
function getGmailClient(accessToken: string): gmail_v1.Gmail {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const rootUrl = process.env.GMAIL_API_ROOT_URL;
  return google.gmail({ version: "v1", auth, ...(rootUrl ? { rootUrl } : {}) });
}

// Gmail refused the user's token or scope: retrying can't help, the user
// has to sign in again to give Inbox Buddy access.
export class GmailAuthError extends Error {
  constructor() {
    super("Gmail access was revoked or has expired");
  }
}

// Gmail has no such message any more: it was deleted (or permanently
// removed from Trash) after the dashboard loaded. Retrying can't help.
export class GmailNotFoundError extends Error {
  constructor() {
    super("The message no longer exists in Gmail");
  }
}

function isGmailNotFound(err: unknown): boolean {
  return toSafeError(err).status === 404;
}

export function isGmailAuthError(err: unknown): boolean {
  const safe = toSafeError(err);
  if (safe.status === 401) return true;
  return safe.status === 403 && /insufficient|permission|scope|unauthori[sz]ed|invalid credentials|disabled/i.test(safe.message);
}

// Every Gmail call is bounded: one request may take GMAIL_CALL_TIMEOUT_MS,
// and reading the whole 24-hour window GMAIL_READ_DEADLINE_MS, so a hung
// Gmail becomes "Couldn't reach Gmail" well before the dashboard gives up
// waiting (lib/client-fetch.ts).
export const GMAIL_CALL_TIMEOUT_MS = 6_000;
export const GMAIL_READ_DEADLINE_MS = 8_000;

type GmailCall<T> = (options: { signal: AbortSignal }) => Promise<T>;

// Reads are retried on transient errors (timeouts included, within the
// retry budget); an auth failure becomes a GmailAuthError so the caller can
// offer "Reconnect Gmail", and a missing message a GmailNotFoundError.
async function gmailRead<T>(fn: GmailCall<T>, deadline?: AbortSignal): Promise<T> {
  try {
    return await withRetry(() => withTimeout((signal) => fn({ signal }), GMAIL_CALL_TIMEOUT_MS, deadline));
  } catch (err) {
    if (isGmailAuthError(err)) throw new GmailAuthError();
    if (isGmailNotFound(err)) throw new GmailNotFoundError();
    throw err;
  }
}

// Changes are never retried (repeating one could act twice), but they are
// bounded by the same per-call timeout.
async function gmailWrite<T>(fn: GmailCall<T>): Promise<T> {
  try {
    return await withTimeout((signal) => fn({ signal }), GMAIL_CALL_TIMEOUT_MS);
  } catch (err) {
    if (isGmailAuthError(err)) throw new GmailAuthError();
    if (isGmailNotFound(err)) throw new GmailNotFoundError();
    throw err;
  }
}

export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// Only messages currently sitting in the inbox (not already filtered to Spam)
// are eligible for spam-flashcard classification.
export function isInInbox(labelIds: string[]): boolean {
  return labelIds.includes("INBOX") && !labelIds.includes("SPAM");
}

// The dashboard covers mail the user *received* in the last 24 hours:
// anything they wrote (Sent, including notes to self, and Drafts) and Chat
// messages are left out. Received mail they already archived still counts,
// because it arrived that day (README "Which mail counts"). Gmail search
// already skips Spam and Trash.
const RECENT_MAIL_QUERY = "newer_than:1d -in:sent -in:drafts -in:chats";
const NOT_RECEIVED_LABELS = ["SENT", "DRAFT", "CHAT"];

// Belt and braces on top of the query: a message the list returns anyway
// is dropped by its labels.
function isReceived(labelIds: string[]): boolean {
  return !labelIds.some((label) => NOT_RECEIVED_LABELS.includes(label));
}

const METADATA_HEADERS = ["From", "Subject", "Date", "List-Unsubscribe", "List-Unsubscribe-Post"];

export function parseMessage(msg: gmail_v1.Schema$Message): ParsedEmail {
  const headers = msg.payload?.headers;
  return {
    id: msg.id!,
    threadId: msg.threadId ?? msg.id!,
    from: getHeader(headers, "From"),
    subject: getHeader(headers, "Subject") || "(no subject)",
    snippet: msg.snippet ?? "",
    date: getHeader(headers, "Date"),
    listUnsubscribe: getHeader(headers, "List-Unsubscribe") || null,
    listUnsubscribePost: getHeader(headers, "List-Unsubscribe-Post") || null,
    isInInbox: isInInbox(msg.labelIds ?? []),
  };
}

async function mapConcurrent<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export async function fetchRecentMessages(accessToken: string): Promise<InboxWindow> {
  const gmail = getGmailClient(accessToken);
  const deadline = deadlineSignal(GMAIL_READ_DEADLINE_MS);

  const ids: string[] = [];
  let pageToken: string | undefined;
  let totalEstimate = 0;
  let truncated = false;
  do {
    const list = await gmailRead(
      (options) => gmail.users.messages.list({ userId: "me", q: RECENT_MAIL_QUERY, maxResults: PAGE_SIZE, pageToken }, options),
      deadline
    );
    totalEstimate = Math.max(totalEstimate, list.data.resultSizeEstimate ?? 0);
    for (const m of list.data.messages ?? []) if (m.id) ids.push(m.id);
    pageToken = list.data.nextPageToken ?? undefined;
    if (ids.length >= MAX_MESSAGES) {
      truncated = ids.length > MAX_MESSAGES || Boolean(pageToken);
      break;
    }
  } while (pageToken);

  const wanted = ids.slice(0, MAX_MESSAGES);
  // metadata-only: this app never reads message bodies, so we never
  // request them from Gmail in the first place. A message deleted between
  // the list and its read is simply left out.
  const messages = await mapConcurrent(wanted, GET_CONCURRENCY, (id) =>
    gmailRead(
      (options) => gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: METADATA_HEADERS }, options),
      deadline
    ).then(
      (res) => res.data,
      (err) => {
        if (err instanceof GmailNotFoundError) return null;
        throw err;
      }
    )
  );

  const emails = messages
    .filter((m): m is gmail_v1.Schema$Message => m !== null && isReceived(m.labelIds ?? []))
    .map(parseMessage);
  return { emails, truncated, totalEstimate: Math.max(totalEstimate, emails.length) };
}

export type UnsubscribeHeaders = { listUnsubscribe: string | null; listUnsubscribePost: string | null };

export async function getUnsubscribeHeaders(accessToken: string, messageId: string): Promise<UnsubscribeHeaders> {
  const gmail = getGmailClient(accessToken);
  const msg = await gmailRead((options) =>
    gmail.users.messages.get(
      { userId: "me", id: messageId, format: "metadata", metadataHeaders: ["List-Unsubscribe", "List-Unsubscribe-Post"] },
      options
    )
  );
  const headers = msg.data.payload?.headers;
  return {
    listUnsubscribe: getHeader(headers, "List-Unsubscribe") || null,
    listUnsubscribePost: getHeader(headers, "List-Unsubscribe-Post") || null,
  };
}

export async function trashMessage(accessToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmailWrite((options) => gmail.users.messages.trash({ userId: "me", id: messageId }, options));
}

// Undo for Delete.
export async function untrashMessage(accessToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmailWrite((options) => gmail.users.messages.untrash({ userId: "me", id: messageId }, options));
}

export async function archiveMessage(accessToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmailWrite((options) =>
    gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { removeLabelIds: ["INBOX"] } }, options)
  );
}

// Undo for the archive step of Unsubscribe (the unsubscribe itself can't be undone).
export async function unarchiveMessage(accessToken: string, messageId: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmailWrite((options) =>
    gmail.users.messages.modify({ userId: "me", id: messageId, requestBody: { addLabelIds: ["INBOX"] } }, options)
  );
}
