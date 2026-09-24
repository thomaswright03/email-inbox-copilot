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
| Unwanted sign-ins spending quota | Google `email_verified` required; optional `ALLOWED_EMAILS` allowlist | `auth.ts` (`signIn` callback) |
| CSRF on Delete/Unsubscribe | SameSite=Lax cookie, a same-origin check (`Origin` / `Sec-Fetch-Site`), and `application/json` required (415 otherwise), so no HTML form can submit it | `lib/api.ts`, `app/api/actions/route.ts` |
| Malformed or hostile input | Strict zod schema; Gmail ids must match `^[A-Za-z0-9_-]{1,64}$`; 1 KB body cap | `app/api/actions/route.ts` |
| Acting before consent | Every data route returns 403 until the current Terms/Privacy version is accepted; the version is set server-side only | `lib/api.ts`, `auth.ts` (jwt callback) |
| SSRF via `List-Unsubscribe` | http(s) only, ports 80/443, no credentials, every resolved address checked against private/reserved IPv4/IPv6 ranges (incl. mapped, NAT64, 6to4, Teredo), per-hop redirect checks, max 5 redirects, 10 s timeout. The check runs inside the socket's DNS lookup, so DNS rebinding can't swap the address after the check. | `lib/safe-fetch.ts` |
| Prompt injection from email content | Sender text is size-bounded, stripped of control/zero-width characters and angle brackets, and delimited as untrusted data under a system instruction. Each spam candidate is classified in its own model call and the verdict is attached to the email that was sent, so one email cannot change another's verdict. The model must answer `{isSpam, reason}` with `reason` from a fixed enum (response schema + zod); the UI shows a fixed label, never model text, and no model text is stored. Summary links, images and HTML are stripped on the server and not rendered on the client, and the CSP blocks remote images. The model has no tools and cannot take actions. | `lib/ai.ts`, `lib/spam-reasons.ts`, `components/Dashboard.tsx` |
| Attacker-driven spend | Per-user limits on inbox reads and actions, per-user and global daily caps on Gemini calls, single-flight caching so parallel requests share one call, output-token caps | `lib/rate-limit.ts`, `lib/response-cache.ts`, `lib/ai.ts` |
| Cross-user data leaks via cache | Cache keys use the stable Google account id (never a shared fallback); DB cache values are AES-256-GCM encrypted and bound to their key | `lib/response-cache.ts`, `lib/db-cache.ts`, `lib/crypto.ts` |
| Data left behind | Expired cache rows are deleted on write; sign-out purges the user's cache rows in every layer; cache keys hold the Google account id, not the email address | `lib/db-cache.ts`, `auth.ts` (`events.signOut`) |
| Over-privileged database credential | No DDL runs in the app. Schema lives in `migrations/` and is applied with the owner role; the runtime role gets only the DML each table needs, and the audit log is append-only for it. | `migrations/001_init.sql`, `scripts/migrate.mjs` |
| Secrets in logs | Errors are reduced to name/message/status with bearer tokens, API keys, OAuth codes and connection strings redacted | `lib/log.ts` |
| XSS, clickjacking, sniffing | Per-request nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP; API responses are `no-store` | `proxy.ts`, `next.config.ts` |
| Detection | Audit rows (and `level: "audit"` log lines) for sign-in, rejected sign-in, sign-out, token-refresh failure and every Delete/Unsubscribe/Ignore/classification; `level: "security"` lines for rate-limit hits, blocked SSRF, cross-site requests, invalid input and rejected sessions; rate-limit crossings, SSRF/CSRF attempts, revoked-session replays and Gemini quota exhaustion also post to `ALERT_WEBHOOK_URL` | `lib/audit.ts`, `lib/log.ts`, `lib/alert.ts` |
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
`audit_log` (append-only), `SELECT/INSERT/UPDATE/DELETE` on `response_cache` and
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
| `GEMINI_API_KEY` | own key | own key | own key, with a quota cap in Google Cloud |
| `DATABASE_URL` | own database or branch | own Neon branch | production database, `inbox_app` role |
| `ALLOWED_EMAILS` | developer | testers | the customer's accounts |

## Revoking one user's sessions

```bash
DATABASE_URL='<inbox_app connection>' node scripts/revoke-sessions.mjs <google-account-id>
```

The Google account id is the `google_id` in `user_sessions`. Their next request gets a 401.
To cut Gmail access as well, the user removes the app at
https://myaccount.google.com/permissions (signing out in the app already revokes the token).

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

- Set `AUTH_SECRET` to 32+ random bytes, and `ALLOWED_EMAILS` for a private deployment.
- Keep the Google OAuth app's authorized redirect URIs limited to your real domains.
- Set up the database as above, and `ALERT_WEBHOOK_URL` for alerts.
- Forward logs to a drain and alert on `"level":"security"` and `"level":"alert"` lines.

## Reporting a vulnerability

Please report security issues privately to the repository owner through GitHub's "Report a vulnerability" (private security advisory) rather than a public issue.
