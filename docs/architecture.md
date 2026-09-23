# Architecture

Inbox Buddy is a Next.js App Router app with no separate backend — server-side logic
lives in `app/api/*/route.ts` handlers, called by the client component `Dashboard.tsx`.

## Request flow

1. **Sign-in.** `auth.ts` (NextAuth) runs the Google OAuth flow with Gmail scopes
   (`gmail.readonly`, `gmail.modify`). The access token, refresh token, and expiry are
   stored in an encrypted JWT session cookie. On every request, the `jwt` callback checks
   whether the access token is close to expiring and, if so, exchanges the refresh token
   for a new one via `lib/google-auth.ts` — the user is never forced to re-sign-in just
   because an hour passed, only after 30 days of inactivity (`auth.ts`).
2. **Consent gate.** `app/page.tsx` blocks the dashboard until `session.legalVersionAccepted`
   matches `content/legal.ts`'s `LEGAL_VERSION` — `components/ConsentGate.tsx` handles the
   checkbox flow and re-prompts whenever the legal text materially changes.
3. **Dashboard load.** `components/Dashboard.tsx` fetches `GET /api/emails/today` and
   `GET /api/emails/spam` in parallel on mount. Both routes call `fetchTodaysMessages`
   (`lib/gmail.ts`), which lists Gmail messages from the last 24h and fetches
   metadata-only (`format: "metadata"`, no message bodies) for each one.
4. **AI calls.** `lib/ai.ts` calls Gemini (`gemini-3.5-flash-lite`) once per tab load:
   `summarizeToday` for the digest, `classifySpam` for spam verdicts (only for messages
   that clear a cheap heuristic pre-filter first, to cut down on model calls). Both API
   routes cache their response per user+day for 5 minutes (`lib/cache.ts`, in-memory,
   best-effort — not durable across cold starts) to reduce redundant Gmail/Gemini calls
   against Gemini's free-tier daily request ceiling.
5. **Actions.** `POST /api/actions` handles Delete/Unsubscribe/Ignore. Unsubscribe fetches
   the sender-controlled `List-Unsubscribe` URL through `lib/safe-fetch.ts`, which blocks
   private/loopback/link-local/cloud-metadata addresses (re-checked on every redirect hop,
   not just the first). Every action is logged via `lib/audit.ts`.

## Data stores

- **Gmail** is the only source of truth for email content — nothing is durably stored by
  this app beyond what's listed below.
- **Postgres (Neon, optional)** holds only the audit log (`audit_log` table: account,
  action, message ID, timestamp — no message content). If `DATABASE_URL` isn't set,
  `lib/audit.ts` silently no-ops rather than breaking the action it's logging;
  `GET /api/health` (requires sign-in) reports whether it's actually configured and
  reachable, so a missing `DATABASE_URL` doesn't fail silently to an operator too.
- **Session cookie (JWT)** holds the Google access/refresh tokens and legal-consent state.

## Where things live

| Concern | File |
|---|---|
| Auth + token refresh | `auth.ts`, `lib/google-auth.ts` |
| Gmail access | `lib/gmail.ts` |
| AI summarization/classification | `lib/ai.ts` |
| SSRF-safe outbound fetch | `lib/safe-fetch.ts` |
| Unsubscribe header parsing | `lib/unsubscribe.ts` |
| Audit logging | `lib/audit.ts` |
| Response caching | `lib/cache.ts` |
| Legal content + consent versioning | `content/legal.ts`, `components/ConsentGate.tsx` |
