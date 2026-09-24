# Security

Inbox Buddy holds a Google OAuth grant with `gmail.modify` for every signed-in
user, sends email metadata to Gemini, and makes server-side requests to URLs
that email senders choose. This file lists the controls that protect that,
where each one lives, and what an operator has to do outside the code.

## Controls in the code

| Threat | Control | Where |
|---|---|---|
| Google tokens stolen from the browser (XSS, extensions, logs) | Access and refresh tokens stay in the encrypted, HttpOnly, `__Secure-` session cookie and are read only on the server. `/api/auth/session` returns no token. | `auth.ts` (session callback), `lib/session.ts` |
| Stolen session cookie replayed | 12-hour idle lifetime. Sign-out revokes the Google refresh token at Google, bumps the user's server-side session version (every copied cookie is then refused, failing closed if the store is unreachable) and purges their cache. An operator can revoke one user's sessions with `scripts/revoke-sessions.mjs` without touching `AUTH_SECRET`. | `auth.ts` (`events.signOut`), `lib/session-store.ts`, `lib/session.ts` |
| Over-broad Google grant | Only `gmail.modify` is requested (needed for trash/archive; covers the metadata reads). `gmail.readonly` is not. | `auth.ts` |
| A new API route shipping without auth | `proxy.ts` refuses every `/api/*` request other than `/api/auth/*` without a valid session cookie, before any route code runs; routes then apply the full check. | `proxy.ts`, `lib/api.ts` |
| Unwanted sign-ins spending quota | Google `email_verified` required; `ALLOWED_EMAILS` allowlist, and in production an empty allowlist lets nobody in | `auth.ts` (`signIn` callback) |
| CSRF on Delete/Done/Unsubscribe | SameSite=Lax cookie, a same-origin check (`Origin` / `Sec-Fetch-Site`), and `application/json` required (415 otherwise), so no HTML form can submit it | `lib/api.ts`, `app/api/actions/route.ts` |
| Malformed or hostile input | Strict zod schema; Gmail ids must match `^[A-Za-z0-9_-]{1,64}$`; 1 KB body cap | `app/api/actions/route.ts` |
| Acting before consent | Every data route returns 403 until the current Terms/Privacy version is accepted; the version is set server-side only, and only after a durable `consent_records` row is written | `lib/api.ts`, `auth.ts` (jwt callback), `lib/consent.ts` |
| Gmail data reaching a Gemini tier that may train on it | Gemini is called only when `GEMINI_PAID_TIER_PROJECT` attests a billing-enabled (paid) project; otherwise the rule-based fallback runs and nothing is sent | `lib/ai.ts` (`aiEnabled`), `lib/rules.ts` |
| SSRF via `List-Unsubscribe` | http(s) only, ports 80/443, no credentials, every resolved address checked against private/reserved IPv4/IPv6 ranges (incl. mapped, NAT64, 6to4, Teredo), per-hop redirect checks, max 5 redirects, 10 s timeout. The check runs inside the socket's DNS lookup, so DNS rebinding can't swap the address after the check. | `lib/safe-fetch.ts` |
| Prompt injection from email content | Sender text is size-bounded, stripped of control/zero-width characters and angle brackets, and delimited as untrusted data under a system instruction. Triage calls of up to 25 emails each sort the day's inbox and give each email a spam verdict; each email is sent under an opaque handle (`e1`, `e2`, …) that the server maps back to the Gmail id, so the model can never name a real message, and each entry is validated on its own (response schema + zod, bad entries dropped one by one). A spam flag is only honoured for an email that cleared the heuristic pre-filter by itself, so text planted in one email cannot get an ordinary message flagged; the spam reason comes from a fixed enum and the UI shows a fixed label, never model text. The briefing's one-line action and date are model text: links, images and angle brackets are stripped on the server, lengths are capped, and the dashboard renders them as plain text only; the CSP blocks remote images. Model text is kept only in the 5-minute encrypted cache. The model has no tools and cannot take actions. | `lib/ai.ts`, `lib/spam-reasons.ts`, `components/Dashboard.tsx` |
| Attacker-driven spend | Per-user limits on inbox reads and actions, per-user and global daily caps on Gemini calls (in production these are enforced only from the shared Postgres counter and fail closed if it is unreachable), single-flight caching so the summary and spam routes share one load's calls, at most one triage call per 25 inbox emails per uncached load (a load reads at most 100 emails, so at most 4 calls, made at the same time) and none when the cached triage still covers the inbox, a failed triage cached for 60 seconds so reloads can't re-spend calls while Gemini is failing, per-call output-token caps and timeouts sized to the chunk | `lib/rate-limit.ts`, `lib/response-cache.ts`, `lib/triage.ts`, `lib/ai.ts` |
| Test stand-ins left on in production | `GMAIL_API_ROOT_URL` / `GEMINI_API_ROOT_URL` (end-to-end tests only) are ignored unless `E2E_STAND_INS=1`, never apply on Vercel, and only accept a loopback `http` URL, so a Google access token or `GEMINI_API_KEY` is never sent to another host; the Gemini client always pins Google's endpoint with Vertex off, so the SDK's own `GOOGLE_GEMINI_BASE_URL` can't redirect it; the AI budget only counts in memory for that test mode; any of the three set on a production server raises a `config_invalid` alert at startup | `lib/stand-ins.ts`, `lib/ai.ts`, `lib/gmail.ts`, `lib/rate-limit.ts`, `lib/config-check.ts` |
| Cross-user data leaks via cache | Cache keys use the stable Google account id (never a shared fallback); DB cache values are AES-256-GCM encrypted and bound to their key | `lib/response-cache.ts`, `lib/db-cache.ts`, `lib/crypto.ts` |
| Data left behind | Audit rows carry the Google account id, never the email, and are deleted after `AUDIT_RETENTION_DAYS` (default 90); consent records after 3 years; session-version rows 30 days after the last sign-in; expired cache rows are deleted on write; sign-out purges the user's cache rows in every layer; `scripts/user-data.mjs` exports or deletes one user's rows on request | `lib/db-cache.ts`, `auth.ts` (`events.signOut`), `migrations/002_consent_and_session_expiry.sql`, `scripts/user-data.mjs` |
| Over-privileged database credential | No DDL runs in the app. Schema lives in `migrations/` and is applied with the owner role; the runtime role gets only the DML each table needs, and the audit log is append-only for it. | `migrations/001_init.sql`, `scripts/migrate.mjs` |
| Secrets in logs | Errors are reduced to name/message/status with bearer tokens, API keys, OAuth codes and connection strings redacted | `lib/log.ts` |
| XSS, clickjacking, sniffing | Per-request nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP; API responses are `no-store` | `proxy.ts`, `next.config.ts` |
| Detection | Audit rows (and `level: "audit"` log lines) for sign-in, rejected sign-in, sign-out, consent, token-refresh failure and every Delete/Done/Snooze/Unsubscribe/Ignore/Undo/classification; `level: "security"` lines for rate-limit hits, blocked SSRF, cross-site requests, invalid input and rejected sessions; rate-limit crossings, SSRF/CSRF attempts, revoked-session replays and Gemini quota exhaustion also post to `ALERT_WEBHOOK_URL` | `lib/audit.ts`, `lib/log.ts` |
| Supply chain | Exact versions for runtime dependencies, lockfile installs with `--ignore-scripts`, `npm audit` gate, gitleaks history scan, CodeQL, Dependabot, SHA-pinned actions, read-only `GITHUB_TOKEN` | `package.json`, `.github/` |

## Database setup

The app never creates or alters tables. Run once per environment, from a trusted machine:

```sql
-- as the database owner; take the password from your secret manager
CREATE ROLE inbox_app LOGIN PASSWORD '<generated>';
```

```bash
MIGRATION_DATABASE_URL='postgres://<owner>@<host>/<db>' APP_DB_ROLE=inbox_app npm run db:migrate
```

`db:migrate` applies `migrations/*.sql` and then grants `inbox_app` exactly: `INSERT` on
`audit_log` (append-only, plus `EXECUTE` on `purge_audit_log()` which can only delete rows past retention), `SELECT/INSERT/UPDATE/DELETE` on `response_cache` and
`rate_limit`, `SELECT/INSERT/UPDATE` on `user_sessions`, and revokes `CREATE` on the
schema. Set the app's `DATABASE_URL` to the `inbox_app` connection string; never give the
app the owner string. Check it: connected as `inbox_app`, `CREATE TABLE t (x int)` and
`DROP TABLE audit_log` must both fail with a permission error.

## Environments

Every environment gets its own value for every secret, so a leaked development value
never works in production.

| Secret | Development | Preview | Production |
|---|---|---|---|
| Google OAuth client (`AUTH_GOOGLE_ID`/`SECRET`) | own client, localhost redirect only | own client | own client, production domain only |
| `AUTH_SECRET` | own | own | own |
| `GEMINI_API_KEY` | own key (paid project) | own key (paid project) | own key in the billing-enabled project, with a quota cap in Google Cloud |
| `GEMINI_PAID_TIER_PROJECT` | empty unless the key is paid | same | the paid project id, recorded in `docs/compliance-records.md` |
| `DATABASE_URL` | own database or branch | own Neon branch | production database, `inbox_app` role |
| `ALLOWED_EMAILS` | developer | testers | the customer's accounts (required) |

## Revoking one user's sessions

```bash
DATABASE_URL='<inbox_app connection>' node scripts/revoke-sessions.mjs <google-account-id>
```

The Google account id is the `google_id` in `user_sessions`. Their next request gets a 401.
To cut Gmail access as well, the user removes the app at
https://myaccount.google.com/permissions (signing out in the app already revokes the token).

## Access and deletion requests

```bash
AUTH_SECRET='<production AUTH_SECRET>' node scripts/user-data.mjs verify <request-code>
MIGRATION_DATABASE_URL='<owner connection>' node scripts/user-data.mjs export <google-account-id> > export.json
MIGRATION_DATABASE_URL='<owner connection>' node scripts/user-data.mjs delete <google-account-id>
```

Covers `audit_log`, `consent_records`, `user_sessions`, `response_cache` and `rate_limit`.
It needs the owner connection because the app role can't read or delete the audit and
consent tables. Users start a request from the dashboard's "Your data" link, which emails
their account id with a signed request code (`lib/data-request.ts`). `verify` checks the
code and prints the account id and email it was issued to; act only if the request came
from that email. Answer within 30 days (Privacy Policy section 6). Incidents: `docs/incident-response.md`.

## Rotating credentials

None of these needs a code change. Rotate immediately if a value is exposed, and at least yearly.

| Credential | How to rotate | Effect |
|---|---|---|
| `AUTH_SECRET` | Generate a new one (`npx auth secret`), set it in the host, redeploy | Everyone is signed out; the encrypted cache becomes unreadable (treated as misses) |
| `AUTH_GOOGLE_SECRET` | Google Cloud Console → Credentials → the OAuth client → add a new secret, deploy it, then delete the old one | None for users |
| `GEMINI_API_KEY` | Google AI Studio → create a new key, deploy it, delete the old key | None |
| `DATABASE_URL` password | `ALTER ROLE inbox_app PASSWORD '<new>'` as owner, update the host, redeploy | None |
| `ALERT_WEBHOOK_URL` | Regenerate the webhook in Slack/Discord, update the host | None |

## Operator checklist (outside the code)

- Set `AUTH_SECRET` to 32+ random bytes, and `ALLOWED_EMAILS` (required in production).
- Set `GEMINI_PAID_TIER_PROJECT` only once `GEMINI_API_KEY` belongs to a billing-enabled project, and record it in `docs/compliance-records.md`.
- Keep the Google OAuth app's authorized redirect URIs limited to your real domains.
- Set up the database as above, and `ALERT_WEBHOOK_URL` for alerts.
- Forward logs to a drain and alert on `"level":"security"` and `"level":"alert"` lines.

## Reporting a vulnerability

Please report security issues privately to the repository owner through GitHub's "Report a vulnerability" (private security advisory) rather than a public issue.
