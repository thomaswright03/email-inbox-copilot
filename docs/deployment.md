# Deploying Inbox Buddy

From nothing to a working production deployment, and back again. It assumes the hosting
this project was built for, **Vercel** for the app and **Neon** for Postgres. Any host
that runs `next build` / `next start` on Node 22 works the same way; the host-specific
steps are marked.

Budget about an hour the first time. Every command is run from a clone of this
repository on a trusted machine.

## 0. What production needs

| Piece | Why it is required |
|---|---|
| A Google Cloud project with the Gmail API and an OAuth client | Sign-in and Gmail access |
| A Postgres database (Neon) with the migrations applied | Without it **no user can get past the consent screen** (agreements must be stored, `lib/consent.ts`), sessions can't be revoked, and the AI budget fails closed |
| A host running Node 22 | The app itself |
| An `ALLOWED_EMAILS` list | In production an empty list lets nobody sign in |

A production server that starts without these logs a `"kind":"config_invalid"` alert
naming each missing setting (`instrumentation.ts`), and `/api/health` reports
`configOk: false`.

## 1. Google Cloud

1. In [console.cloud.google.com](https://console.cloud.google.com), create a project for
   production (keep development and preview in their own projects or clients).
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **OAuth consent screen**: app name "Inbox Buddy", support email, the privacy policy URL
   `https://<your-domain>/privacy` and terms URL `https://<your-domain>/terms`. Add the
   scope `https://www.googleapis.com/auth/gmail.modify`.
   - `gmail.modify` is a *restricted* scope. While the app's publishing status is
     **Testing**, only the listed test users can sign in (up to 100) and Google expires
     their refresh tokens after 7 days, so users are asked to sign in again weekly. Going
     beyond that needs Google's verification of the app (and, for restricted scopes, a
     security assessment). Start that early; it takes weeks.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origin: `https://<your-domain>`
   - Authorized redirect URI: `https://<your-domain>/api/auth/callback/google`
   - Nothing else: no localhost, no preview domains on the production client.
5. Keep the client ID and secret for step 4.

**AI (optional).** AI features stay off until you attest to Gemini's paid tier. To turn
them on, create an API key in a **billing-enabled** Google Cloud project, set a quota cap
there, and record the switch in `docs/compliance-records.md`. Run `npm run eval` with that
key first (see `evals/README.md`).

## 2. Database (Neon)

1. Create a Neon project (region close to your host) and a database, e.g. `inbox`.
2. Copy the **owner** connection string. It is used only for migrations, from your machine
   or a deploy step, and never goes into the app's environment.
3. Create the least-privilege role the app will use (password from your secret manager):

   ```sql
   CREATE ROLE inbox_app LOGIN PASSWORD '<generated>';
   ```

4. Apply the schema and grants:

   ```bash
   MIGRATION_DATABASE_URL='postgres://<owner>@<host>/inbox?sslmode=require' APP_DB_ROLE=inbox_app npm run db:migrate
   ```

   It prints `applied 00x_….sql` for each new migration and then
   `granted least-privilege DML to inbox_app`. It is safe to re-run: applied migrations are
   recorded in `schema_migrations` and skipped.
5. Build the app's `DATABASE_URL` from the same host and database with the `inbox_app`
   user and password (Neon's pooled host is fine). Check it: connected as `inbox_app`,
   `CREATE TABLE t (x int)` must fail with a permission error.

Run `npm run db:migrate` against production **before** deploying any commit that adds a
file to `migrations/`.

## 3. Environment variables

Every environment has its own value for every secret (see `SECURITY.md`, "Environments").

| Variable | Production | Preview | Development (`.env.local`) |
|---|---|---|---|
| `AUTH_SECRET` | `npx auth secret` (32+ random bytes) | its own | its own |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | production OAuth client | preview client | local client (redirect `http://localhost:3000/api/auth/callback/google`) |
| `ALLOWED_EMAILS` | the invited accounts, e.g. `a@client.com,@client.com` | testers | you (or empty = anyone, outside production only) |
| `DATABASE_URL` | `inbox_app` connection to the production database | a Neon branch | optional |
| `GEMINI_API_KEY` | paid-tier key, or empty | paid-tier key, or empty | optional |
| `GEMINI_PAID_TIER_PROJECT` | the paid project id, or empty (AI off) | same | empty unless the key is paid |
| `ALERT_WEBHOOK_URL` | Slack/Discord incoming webhook (https) | optional | empty |
| `AUDIT_RETENTION_DAYS` | optional, default 90 | optional | optional |
| `AI_CALLS_PER_USER_PER_DAY` / `AI_CALLS_GLOBAL_PER_DAY` | optional, defaults 500 / 5000 (see "AI budget" below) | optional | optional |
| `AUTH_TRUST_HOST` | only on hosts other than Vercel: `true` when a proxy you control sets the Host header | same | not needed |

Never set these at runtime: `MIGRATION_DATABASE_URL` (the owner connection), and the
end-to-end tests' `E2E_STAND_INS`, `GMAIL_API_ROOT_URL` and `GEMINI_API_ROOT_URL`. The
two stand-in URLs are ignored unless `E2E_STAND_INS=1`, never apply on Vercel, and only
ever point at this machine (`lib/stand-ins.ts`), so a stray value can't send a Google token
or the Gemini key anywhere but Google; the startup check still flags all four.

### AI budget

Two daily caps bound Gemini spend (`lib/rate-limit.ts`): `AI_CALLS_PER_USER_PER_DAY`
(default **500**) and `AI_CALLS_GLOBAL_PER_DAY` for the whole deployment (default
**5000**). Each triage call counts once, when it is made (its automatic retries don't
count again); a call the budget has no room for is not made.

A dashboard load that needs the model triages today's inbox in chunks of 25 emails, one
call per chunk, made at the same time (`lib/triage.ts`): **ceil(emails / 25) calls, so 1
for up to 25 emails and at most 4 for the 100 a load reads.** The summary and spam tabs
share those calls. A chunk whose call fails, or that the budget has no room for, shows the
rule-based view for just its emails; a failed load is kept for 60 seconds so reloading
doesn't make new calls.

How the defaults are sized:

| Per user, per day | Calls |
|---|---|
| Triage loads: made only when mail arrived since the last one or the cached triage ran out (5 minutes; Done, Undo, Delete and a Refresh with no new mail reuse it), plus once per summary language. About 60 such loads on a busy day | 60 loads |
| Calls per load: 1 per 25 emails in today's inbox, growing through the day | 1 to 4 |
| **Heavy day** (inbox filling up to 100 through the day) | **~150** |
| **Worst case** (100 emails in the inbox all day) | **240** |

The per-user default is about twice the worst case. The deployment default covers 20
partners having a heavy day at the same time (20 × ~150 = 3000) with headroom; raise it by
about 250 per partner beyond 20. Each call is small (at most 25 emails' sender, subject,
preview and date in, a line per email out), so at flash-lite-class prices (see the README)
a call costs a fraction of a cent; check the current price for the full deployment budget
before raising the caps.

**When the day resets:** the window is the **UTC day**, so budgets come back at 00:00 UTC
(for example 8 PM EDT or 5 PM PDT, 1 or 2 AM in Western Europe). When a budget runs out,
the dashboard shows the rule-based view and says, in the user's language, that today's
AI allowance is used up and the local time it comes back (spam verdicts already known are
still shown). Each run-out logs an `ai_budget_exhausted` security event
(and an alert, if `ALERT_WEBHOOK_URL` is set). Raise the caps if that happens on ordinary days.

## 4. Deploy (Vercel)

1. **Add New → Project**, import `thomaswright03/email-inbox-copilot`. Framework preset:
   Next.js. Build command `npm run build`, install command `npm ci`. Node.js version 22.
2. **Settings → Environment Variables**: add the Production values from step 3, scoped to
   *Production*, and the Preview values scoped to *Preview*.
3. **Settings → Domains**: add your domain. It must match the OAuth client's origin and
   redirect URI exactly.
4. Deploy the `main` branch (or promote a tested preview deployment).

On another host: run `npm ci && npm run build`, then `npm start` (port 3000, or
`npm start -- -p <port>`) behind HTTPS, with the same environment variables.

## 5. Verify the deployment

1. **Startup log**: no line containing `"kind":"config_invalid"`. If there is one, it
   names what is missing; fix it and redeploy.
2. **Pages**: `https://<your-domain>/` shows the sign-in card; `/privacy` and `/terms`
   load; `/auth/error?error=AccessDenied` shows the branded "can't use Inbox Buddy" page.
3. **Sign in** with an allowlisted account. The consent screen must show the checkbox and
   **Agree & Continue**, not "isn't fully set up yet" (that message means the database is
   missing). Agree; the dashboard loads.
4. **Health**: while signed in, open `https://<your-domain>/api/health`. Expect
   `{"auditLog":{"configured":true,"reachable":true},"configOk":true}`.
5. **Smoke test**: the summary shows a message count and "Updated …"; Refresh works; the
   Spam tab lists cards (or says there is no suspected spam); mark one card **Not spam**,
   reload, and it stays gone.
6. **Denied account**: sign in with a Google account that is not on `ALLOWED_EMAILS`; it
   lands on the branded access page naming the contact address.
7. **Alerts**: if `ALERT_WEBHOOK_URL` is set, confirm alerts arrive (for example, the
   startup alert from a preview deployment that is missing a setting).

## 6. Roll back

The migrations only ever add tables, columns, indexes and functions (`IF NOT EXISTS`,
`CREATE OR REPLACE`), so older code runs against a newer schema. Rolling back is a code
rollback:

1. **Vercel**: *Deployments* → the last good deployment → **Instant Rollback** (or
   **Promote to Production**). Other hosts: redeploy the previous git tag or commit.
2. Repeat the checks in section 5.
3. Only if a migration itself damaged data: restore the database with Neon's point-in-time
   restore (*Branches → Restore*) to a moment before the migration ran, then roll the code
   back to the matching commit.

Notes:
- Rolling back to a commit with a different `LEGAL_VERSION` (`content/legal.ts`) asks every
  user to accept the Terms again. That is expected.
- To force everyone to sign in again (for example after a leaked secret), rotate
  `AUTH_SECRET`; for one user, use `scripts/revoke-sessions.mjs` (see `SECURITY.md`).
- Caches expire on their own within 5 minutes; nothing needs clearing after a rollback.
