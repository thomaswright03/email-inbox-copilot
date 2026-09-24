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
   load reads Gmail once. `fetchRecentMessages` (`lib/gmail.ts`) lists the mail received
   since the user's local midnight that is still in the inbox (`in:inbox after:<midnight>
   -in:sent`; `?tz=` from the browser, `lib/local-day.ts`), following `nextPageToken` up to
   the newest 100 and reporting when there were more, and fetches metadata only
   (`format: "metadata"`, no message bodies) for each one; anything without the `INBOX`
   label, or labelled `SENT`/`DRAFT`/`CHAT`, is dropped after the read too.
   Reads are retried with backoff on 429/5xx and timeouts (`lib/retry.ts`); a 401/403 from
   Gmail becomes `gmail_reconnect`, which the dashboard shows as "Reconnect Gmail".
   Nothing waits forever (`lib/timeout.ts`): each Gmail request has a 6 s timeout and the
   whole read an 8 s deadline (then "Couldn't reach Gmail"); each Gemini triage call has
   10 s plus 200 ms per email, at most 15 s for a chunk of 25, and a load's calls run at the
   same time (then the rule-based view). The dashboard's own requests
   (`lib/client-fetch.ts`) give up after 25 s with "taking too long" and Try again, and a
   load that is still running after 5 s says it is taking longer than usual.
4. **AI calls.** Only when `aiEnabled()` (both `GEMINI_API_KEY` and
   `GEMINI_PAID_TIER_PROJECT` set, i.e. the key is attested to be on Gemini's paid tier),
   `lib/ai.ts` calls Gemini (`gemini-3.5-flash-lite`) on a load that needs it, once per
   chunk of 25 emails in the inbox (`triageChunks`; `ceil(n / 25)` calls, at most 4 for
   100 emails, made at the same time): `triageToday` is one JSON call over a chunk, each
   email under an opaque handle, with an output limit and timeout sized to the chunk, that
   returns for every email its briefing bucket, one-line action, the date it
   names (as written, and as `dueDate` YYYY-MM-DD worked out from the user's local date,
   time and zone, which the prompt states) and a spam verdict with a fixed reason. It is
   validated entry by entry with Zod in `parseTriage`; a spam flag counts only for an email
   that cleared the heuristic pre-filter (`spamCandidates`) by itself. `lib/triage.ts`
   shares those calls between both routes: whichever asks first makes them, the other waits
   for the same answer, and it is cached per user, day and language for 5 minutes and reused
   while it covers every email now in the inbox, so Done, Undo, Delete and a Refresh with no
   new mail make no new call. Each chunk stands alone: a chunk whose call fails (or that
   the budget has no room for) gets the rule-based view for just its emails
   (`ruleBasedTriage`, listed in `ruleIds`, and its spam cards are logged as "flagged by
   rules"); only when every call fails is the load `unavailable`. A failed or partly failed
   triage is cached for 60 seconds (`TRIAGE_FAILURE_BACKOFF_MS`), so reloads while Gemini
   is down make no new calls. The spam verdicts are also kept per message for 26 hours
   (`lib/verdict-cache.ts`), so the spam route reuses a known verdict without asking again.
   Every call is first reserved from the daily AI budgets (`reserveAiCalls` in
   `lib/rate-limit.ts`), one unit per chunk; if only some fit, the newest chunks get them. Otherwise the routes use the
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
   (`ignore`), the briefing's Done (`done`, archive) and their undos (`undo_delete`
   untrashes, `undo_archive` moves the message back to the inbox, `undo_ignore` forgets the
   choice). A Gmail change drops the user's cached message list and payloads but keeps the
   cached triage (see 4). `snooze` changes nothing in Gmail (its API has no snooze) and
   stores nothing: it only writes an audit row. Snooze and Remind me live in the dashboard
   (`components/dashboard/later.ts`, `useLater.ts`): localStorage per account holds only the
   Gmail message and thread ids and a time; a snoozed item is hidden until then, and a due
   snooze or reminder is highlighted (with a browser notification for a reminder when the
   user allowed them, or a banner linking the thread in Gmail when the email is no longer in
   today's list). Nothing runs in the background: a snooze or reminder only comes due while
   an Inbox Buddy tab is open in that browser (or the next time one is opened), which the
   Remind me hint, its confirmation and the README say. Unsubscribe is done by the server
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
  - `response_cache`: the day's message list, briefing, triage and spam cards (sender,
    subject, snippet, model text), **AES-256-GCM encrypted** with a key derived from
    `AUTH_SECRET`, keyed by `messages|today|spam|triage:<Google account id>:<local date>:<zone>`,
    5-minute TTL. Expired rows are deleted on every
    write; a user's rows are deleted when they sign out, delete or unsubscribe.
    Spam verdicts are stored the same way under `verdicts:<Google account id>:<model>`
    (Gmail message id, spam yes/no and the fixed reason; no content) for 26 hours, so a known
    verdict is never asked for again; kept across Refresh, deleted at sign-out.
  - `rate_limit`: per-user/global request counters (no content), pruned after two days.
  - `user_sessions`: Google account id → session version, used to revoke sessions.
  - `consent_records`: Google account id, `LEGAL_VERSION` and time of each acceptance.
  - `ignored_messages`: Google account id → Gmail message ids marked Not spam, kept 7 days
    (the dashboard only covers today's mail, since the user's local midnight).
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
| AI triage (briefing + spam verdicts) | `lib/ai.ts`, shared by both routes through `lib/triage.ts`; model id and prompt in `lib/ai-prompts.ts` |
| Snooze / Remind me (browser-only) | `components/dashboard/later.ts`, `components/dashboard/useLater.ts` |
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
| End-to-end tests (Gmail and Gemini stand-ins, honoured only with `E2E_STAND_INS=1`) | `e2e/`, `playwright.config.ts`, `lib/stand-ins.ts` |
| Deployment and rollback | `docs/deployment.md` |
