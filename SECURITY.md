# Security

Inbox Buddy holds a Google OAuth grant with `gmail.modify` for every signed-in
user, sends email metadata to Gemini, and makes server-side requests to URLs
that email senders choose. This file lists the controls that protect that,
where each one lives, and what an operator has to do outside the code.

## Controls in the code

| Threat | Control | Where |
|---|---|---|
| Google tokens stolen from the browser (XSS, extensions, logs) | Access and refresh tokens stay in the encrypted, HttpOnly, `__Secure-` session cookie and are read only on the server. `/api/auth/session` returns no token. | `auth.ts` (session callback), `lib/session.ts` |
| Unwanted sign-ins spending quota | Google `email_verified` required; optional `ALLOWED_EMAILS` allowlist | `auth.ts` (`signIn` callback) |
| CSRF on Delete/Unsubscribe | SameSite=Lax cookie plus a same-origin check (`Origin` / `Sec-Fetch-Site`) on every POST | `lib/api.ts`, `app/api/actions/route.ts` |
| Malformed or hostile input | Strict zod schema; Gmail ids must match `^[A-Za-z0-9_-]{1,64}$`; 1 KB body cap | `app/api/actions/route.ts` |
| Acting before consent | Every data route returns 403 until the current Terms/Privacy version is accepted; the version is set server-side only | `lib/api.ts`, `auth.ts` (jwt callback) |
| SSRF via `List-Unsubscribe` | http(s) only, ports 80/443, no credentials, every resolved address checked against private/reserved IPv4/IPv6 ranges (incl. mapped, NAT64, 6to4, Teredo), per-hop redirect checks, max 5 redirects, 10 s timeout. The check runs inside the socket's DNS lookup, so DNS rebinding can't swap the address after the check. | `lib/safe-fetch.ts` |
| Prompt injection from email content | Sender text is size-bounded, stripped of control/zero-width characters and angle brackets, and delimited as untrusted data under a system instruction. The model sees opaque handles, not Gmail ids, so it can't point at messages outside the batch. Output is schema-validated, reasons are bounded, and links, images and HTML are stripped on the server and not rendered on the client. The model has no tools and cannot take actions. | `lib/ai.ts`, `components/Dashboard.tsx` |
| Attacker-driven spend | Per-user limits on inbox reads and actions, per-user and global daily caps on Gemini calls, single-flight caching so parallel requests share one call, output-token caps | `lib/rate-limit.ts`, `lib/response-cache.ts`, `lib/ai.ts` |
| Cross-user data leaks via cache | Cache keys use the stable Google account id (never a shared fallback); DB cache values are AES-256-GCM encrypted and bound to their key | `lib/response-cache.ts`, `lib/db-cache.ts`, `lib/crypto.ts` |
| Data left behind | Expired cache rows are deleted on write; sign-out purges the user's cache rows in every layer | `lib/db-cache.ts`, `auth.ts` (`events.signOut`) |
| Secrets in logs | Errors are reduced to name/message/status with bearer tokens, API keys, OAuth codes and connection strings redacted | `lib/log.ts` |
| XSS, clickjacking, sniffing | Per-request nonce CSP with `strict-dynamic`, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP/CORP; API responses are `no-store` | `proxy.ts`, `next.config.ts` |
| Detection | Structured `level: "security"` log lines for rate-limit hits, blocked SSRF, cross-site requests, invalid input and rejected sign-ins; audit log of every Delete/Unsubscribe/Ignore/classification | `lib/log.ts`, `lib/audit.ts` |
| Supply chain | Lockfile installs with `--ignore-scripts`, `npm audit` gate, gitleaks history scan, CodeQL, Dependabot, SHA-pinned actions, read-only `GITHUB_TOKEN` | `.github/` |

## Operator checklist (outside the code)

- Set `AUTH_SECRET` to 32+ random bytes, and `ALLOWED_EMAILS` for a private deployment.
- Keep the Google OAuth app's authorized redirect URIs limited to your real domains.
- Give the `DATABASE_URL` role only the privileges on `audit_log`, `response_cache` and `rate_limit` the app needs.
- Forward logs to a drain and alert on `"level":"security"` lines.
- If a secret is ever exposed, rotate it: `AUTH_SECRET` (signs everyone out and invalidates the encrypted cache), the Google client secret, the Gemini key, and the database password.

## Reporting a vulnerability

Please report security issues privately to the repository owner through GitHub's "Report a vulnerability" (private security advisory) rather than a public issue.
