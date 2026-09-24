# Architecture

Inbox Buddy is a Next.js App Router app with no separate backend — server-side logic
lives in `app/api/*/route.ts` handlers, called by the client component `Dashboard.tsx`.

## Request flow

1. **Sign-in.** `auth.ts` (NextAuth) runs the Google OAuth flow with Gmail scopes
   (`gmail.modify` only; it covers the metadata reads plus trash/archive). The access
   token, refresh token, and expiry are stored in an encrypted, HttpOnly JWT session
   cookie that only server code reads (`lib/session.ts`). On every request, the `jwt` callback checks
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
4. **AI calls.** Only when `aiEnabled()` (both `GEMINI_API_KEY` and
   `GEMINI_PAID_TIER_PROJECT` set, i.e. the key is attested to be on Gemini's paid tier),
   `lib/ai.ts` calls Gemini (`gemini-3.5-flash-lite`): `summarizeToday` for the digest,
   `classifySpam` for spam verdicts (only for messages that clear a cheap heuristic
   pre-filter first, to cut down on model calls). Otherwise the routes use the rule-based
   `lib/rules.ts` and send nothing to Gemini; each response carries `aiGenerated` so the
   dashboard labels which kind it shows. Both API routes cache their response per
   user+day for 5 minutes, in memory (`lib/cache.ts`) and encrypted in Postgres
   (`lib/db-cache.ts`), to reduce redundant Gmail/Gemini calls; sign-out deletes it.
5. **Actions.** `POST /api/actions` handles Delete/Unsubscribe/Ignore. Unsubscribe fetches
   the sender-controlled `List-Unsubscribe` URL through `lib/safe-fetch.ts`, which blocks
   private/loopback/link-local/cloud-metadata addresses (re-checked on every redirect hop,
   not just the first). Every action is logged via `lib/audit.ts`.

## Data stores

- **Gmail** is the only source of truth for email content. Message bodies are never
  requested; the app reads metadata (sender, subject, preview snippet, date, labels,
  `List-Unsubscribe`).
- **Postgres (Neon, optional)**, schema in `migrations/`, applied by `npm run db:migrate`
  with the owner role; the app itself connects as a least-privilege role (see `SECURITY.md`):
  - `audit_log`: Google account id (not the email address), action, Gmail message id,
    fixed-vocabulary detail, timestamp. Append-only for the app role; rows older than
    `AUDIT_RETENTION_DAYS` (default 90) are deleted through `purge_audit_log()`. No message
    content and no model-written text.
  - `response_cache`: the day's summary and spam cards (sender, subject, snippet, summary),
    **AES-256-GCM encrypted** with a key derived from `AUTH_SECRET`, keyed by
    `today|spam:<Google account id>:<date>`, 5-minute TTL. Expired rows are deleted on every
    write; a user's rows are deleted when they sign out, delete or unsubscribe.
  - `rate_limit`: per-user/global request counters (no content), pruned after two days.
  - `user_sessions`: Google account id → session version, used to revoke sessions.
  If `DATABASE_URL` isn't set these features fall back to per-instance memory or no-op;
  `GET /api/health` (requires sign-in) reports whether it's configured and reachable.
- **Session cookie (encrypted JWT, HttpOnly, 12-hour idle lifetime)** holds the Google
  access/refresh tokens, Google account id, session version and legal-consent state.
  Only the server reads the tokens; `/api/auth/session` never returns them.
- **Per-instance memory**: the L1 response cache and rate-limit fallback, bounded in size.

## Where things live

| Concern | File |
|---|---|
| Auth + token refresh | `auth.ts`, `lib/google-auth.ts` |
| Gmail access | `lib/gmail.ts` |
| AI summarization/classification | `lib/ai.ts` |
| SSRF-safe outbound fetch | `lib/safe-fetch.ts` |
| Unsubscribe header parsing | `lib/unsubscribe.ts` |
| Audit logging | `lib/audit.ts` |
| Response caching | `lib/cache.ts`, `lib/db-cache.ts`, `lib/response-cache.ts` |
| Server-side session, consent and CSRF guards | `lib/session.ts`, `lib/session-store.ts`, `lib/api.ts`, `proxy.ts` |
| Rate limits and AI spend budgets | `lib/rate-limit.ts` |
| Encryption at rest, logging, alerts | `lib/crypto.ts`, `lib/log.ts` |
| Database schema and grants | `migrations/`, `scripts/migrate.mjs` |
| Legal content + consent versioning | `content/legal.ts`, `components/ConsentGate.tsx` |
