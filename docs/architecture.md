# Architecture

Inbox Buddy is a Next.js App Router app with no separate backend — server-side logic
lives in `app/api/*/route.ts` handlers, called by the client component
`components/dashboard/Dashboard.tsx` (split into the header, tabs, summary panel, spam
card, confirm dialog and toast components beside it).

## Request flow

1. **Sign-in.** `auth.ts` (NextAuth) runs the Google OAuth flow with Gmail scopes
   (`gmail.modify` only; it covers the metadata reads plus trash/archive). The access
   token, refresh token, and expiry are stored in an encrypted, HttpOnly JWT session
   cookie that only server code reads (`lib/session.ts`). On every request, the `jwt` callback checks
   whether the access token is close to expiring and, if so, exchanges the refresh token
   for a new one via `lib/google-auth.ts` — the user is never forced to re-sign-in just
   because an hour passed, only after 12 hours of inactivity (`session.maxAge` in
   `auth.ts`), on sign-out, or when access is revoked. A sign-in that fails (not on
   `ALLOWED_EMAILS`, unverified email, provider or configuration error) lands on the
   branded `app/auth/error` page (`pages.error`).
2. **Consent gate.** `app/page.tsx` blocks the dashboard until `session.legalVersionAccepted`
   matches `content/legal.ts`'s `LEGAL_VERSION` — `components/ConsentGate.tsx` handles the
   checkbox flow and re-prompts whenever the legal text materially changes. The acceptance
   is applied only once a row is written to `consent_records` (`lib/consent.ts`); a
   production deployment without `DATABASE_URL` shows "isn't fully set up yet" instead.
3. **Dashboard load.** The dashboard (`components/dashboard/useInbox.ts`) fetches
   `GET /api/emails/today` and `GET /api/emails/spam` in parallel on mount, and again with
   `?refresh=1` when the user presses Refresh. Both routes read the message list through
   `readInbox` (`lib/inbox.ts`), which caches it per user for 5 minutes, so one dashboard
   load reads Gmail once. `fetchRecentMessages` (`lib/gmail.ts`) lists messages from the
   last 24h (following `nextPageToken`, up to the newest 100, and reports when there were
   more) and fetches metadata only (`format: "metadata"`, no message bodies) for each one.
   Reads are retried with backoff on 429/5xx and timeouts (`lib/retry.ts`); a 401/403 from
   Gmail becomes `gmail_reconnect`, which the dashboard shows as "Reconnect Gmail".
   Nothing waits forever (`lib/timeout.ts`): each Gmail request has a 6 s timeout and the
   whole read an 8 s deadline (then "Couldn't reach Gmail"); a Gemini call has 10 s for the
   summary and 5 s per spam check (then the rule-based view). The dashboard's own requests
   (`lib/client-fetch.ts`) give up after 20 s with "taking too long" and Try again, and a
   load that is still running after 5 s says it is taking longer than usual.
4. **AI calls.** Only when `aiEnabled()` (both `GEMINI_API_KEY` and
   `GEMINI_PAID_TIER_PROJECT` set, i.e. the key is attested to be on Gemini's paid tier),
   `lib/ai.ts` calls Gemini (`gemini-3.5-flash-lite`): `summarizeToday` for the Actionable Briefing (one
   JSON call over the mail still in the inbox, each email under an opaque handle, validated
   item by item with Zod in `parseBriefing`),
   `classifyCandidates` for spam verdicts (only for messages that clear a cheap heuristic
   pre-filter first, one call per email, at most 20 per load). Each email's verdict is
   cached for 26 hours (`lib/verdict-cache.ts`), so it is checked once; candidates not
   checked yet are counted in the response (`unchecked`) and checked on the next load.
   Every call is first reserved from the daily AI budgets (`reserveAiCalls` in
   `lib/rate-limit.ts`); calls not made are given back. Otherwise the routes use the
   rule-based `lib/rules.ts` and send nothing to Gemini; each response carries `aiStatus` so
   the dashboard labels which kind it shows. If Gemini fails the routes fall back to the same
   rule-based view with `aiStatus: "unavailable"`; if the daily AI budget is used up, with
   `aiStatus: "budget"` and `aiResetsAt`, so the dashboard can say when AI comes back. Only a
   Gmail failure produces an error. Each model call logs one `ai_usage` line (feature,
   model, tokens, latency, outcome). Both API routes cache their response per user+day for
   5 minutes, in memory (`lib/cache.ts`) and encrypted in Postgres (`lib/db-cache.ts`), to
   reduce redundant Gmail/Gemini calls; sign-out deletes it. The spam response leaves out
   every message the user marked Not spam (`lib/ignored.ts`) on every request, cached or not.
5. **Actions.** `POST /api/actions` handles Delete (Gmail Trash), Unsubscribe, Not spam
   (`ignore`) and their undos (`undo_delete` untrashes, `undo_archive` moves the message
   back to the inbox, `undo_ignore` forgets the choice). Unsubscribe is done by the server
   only for RFC 8058 one-click senders (`lib/unsubscribe.ts`): one POST with
   `List-Unsubscribe=One-Click` through `lib/safe-fetch.ts`, which blocks
   private/loopback/link-local/cloud-metadata addresses at connect time and never follows
   redirects. Only a 2xx answer counts; the message is then archived, and an archive failure
   is reported as exactly that. Link-only and mailto-only senders are handed to the user
   (the sender's page, or a prefilled Gmail draft). Gmail changes are never retried. Every
   action is logged via `lib/audit.ts`.

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
    Spam verdicts are stored the same way under `verdicts:<Google account id>:<model>`
    (Gmail message id, spam yes/no and the fixed reason; no content) for 26 hours, so each
    email is sent to Gemini once; kept across Refresh, deleted at sign-out.
  - `rate_limit`: per-user/global request counters (no content), pruned after two days.
  - `user_sessions`: Google account id → session version, used to revoke sessions.
  - `consent_records`: Google account id, `LEGAL_VERSION` and time of each acceptance.
  - `ignored_messages`: Google account id → Gmail message ids marked Not spam, kept 7 days
    (the spam list only covers the last 24 hours).
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
| AI summarization/classification | `lib/ai.ts`; model id and prompts in `lib/ai-prompts.ts` |
| SSRF-safe outbound fetch | `lib/safe-fetch.ts` |
| Unsubscribe header parsing | `lib/unsubscribe.ts` |
| Audit logging | `lib/audit.ts` |
| Response caching | `lib/cache.ts`, `lib/db-cache.ts`, `lib/response-cache.ts` |
| Server-side session, consent and CSRF guards | `lib/session.ts`, `lib/session-store.ts`, `lib/api.ts`, `proxy.ts` |
| Rate limits and AI spend budgets | `lib/rate-limit.ts` |
| Encryption at rest, logging, alerts | `lib/crypto.ts`, `lib/log.ts` |
| Database schema and grants | `migrations/`, `scripts/migrate.mjs` |
| Legal content + consent versioning | `content/legal.ts`, `components/ConsentGate.tsx`, `lib/consent.ts` |
| Interface languages (EN/ES/FR) and theme | `lib/i18n/`, `components/I18nProvider.tsx`, `lib/theme.ts`, `components/ThemeProvider.tsx` |
| Startup configuration check | `instrumentation.ts`, `lib/config-check.ts` |
| AI quality evals | `evals/` (see `evals/README.md`) |
| End-to-end tests | `e2e/`, `playwright.config.ts` |
| Deployment and rollback | `docs/deployment.md` |
