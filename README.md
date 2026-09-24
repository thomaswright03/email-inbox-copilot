# Inbox Buddy

A daily email summary + spam flashcards front end, built on Gmail (works from any browser on Windows or Mac — no native mail client integration needed).

## What it does

- **Today's Summary tab** — reads the messages from the last 24 hours (up to the newest 100, and it says so when there were more) and asks Gemini for a short, skimmable summary of what actually matters. With AI features off, or when Gemini fails, it lists the messages to check and the likely bulk mail using simple rules instead. It shows when it was last updated, has a Refresh button, and links every message to Gmail.
- **Spam Flashcards tab** — flags inbox messages (not already in Junk/Spam) that look promotional or spammy, shown as cards with sender, subject, the reason, and an Open in Gmail link. Each card has:
  - **Delete** — asks first, moves the message to Gmail Trash, and can be undone from the toast.
  - **Unsubscribe** — for senders that support RFC 8058 one-click unsubscribe, the server sends the one-click POST and archives the message; only a 2xx answer counts as unsubscribed. Senders with only a web link get **Open unsubscribe page** (you confirm on their page), and mailto-only senders get **Email to unsubscribe** (a prefilled Gmail draft).
  - **Not spam** — the message is never flagged again for you (stored per user), and can be undone.
- English, Spanish and French; light, dark or system theme.

## Setup

### 1. Google Cloud / Gmail API

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Gmail API** (APIs & Services → Library).
3. Configure the **OAuth consent screen** (External is fine for personal use), add the `gmail.modify` scope, and add your Google account as a test user.
4. Create an **OAuth 2.0 Client ID** (Web application) under Credentials.
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
   - Add your production URL's equivalent when you deploy.
5. Copy the Client ID and Client Secret.

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from step 1.
- `AUTH_SECRET` — generate with `npx auth secret`.
- `ALLOWED_EMAILS` — allowlist of Google accounts (addresses and/or `@domain`s) allowed to sign in. Required in production, where an empty list lets nobody in.
- `GEMINI_API_KEY` — a key from a **billing-enabled** Google Cloud project (Gemini paid tier). Never use a free-tier key: Google may use free-tier content to improve its products, which Gmail data must not be used for.
- `GEMINI_PAID_TIER_PROJECT` — the id of that paid project. AI features stay off (rule-based summary and spam list, nothing sent to Gemini) until it is set. Record the switch in `docs/compliance-records.md`.
- `DATABASE_URL` — **required in production**, optional for local development. It stores users' agreement to the Terms (without it, nobody can get past the consent screen in production), the audit log, Not spam choices, the shared encrypted cache, shared rate limits and session revocation, and the AI spend budget fails closed without it. Create the schema with `npm run db:migrate` (owner connection in `MIGRATION_DATABASE_URL`) and point `DATABASE_URL` at the least-privilege app role; see [`SECURITY.md`](SECURITY.md#database-setup). Locally, without it, those features fall back to memory or no-op. A production server missing it logs a `config_invalid` alert at startup, and `GET /api/health` (signed in) reports whether the database is configured and reachable.
- `ALERT_WEBHOOK_URL` — optional Slack/Discord-style webhook for security alerts.

### 3. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

To deploy to production (Vercel + Neon), follow [`docs/deployment.md`](docs/deployment.md): Google OAuth setup, the database and migrations, environment variables per environment, verification and rollback.

### 4. Tests

```bash
npm test               # Vitest: API routes, lib/, and the React components (jsdom)
npm run test:coverage  # the same, failing below the coverage thresholds in vitest.config.ts
npm run build && npm run test:e2e   # Playwright against the production build
npm run eval:rules     # scores the rule-based spam flags against evals/golden (offline)
npm run eval           # scores the Gemini prompts and model (needs the paid-tier key)
npm run lint
npx tsc --noEmit
```

The end-to-end tests start `next start` and a local stand-in for the Gmail API (`e2e/gmail-stub.mjs`) and sign in with a session cookie they mint, so they need no Google account. They need Playwright's Chromium (`npx playwright install chromium`); on a machine that can't download it, point `PLAYWRIGHT_CHROMIUM_EXECUTABLE` at an installed Chromium. `npm run eval` is described in [`evals/README.md`](evals/README.md).

Lint, types, tests with coverage, the rule-based eval, the end-to-end tests, `npm audit` and a gitleaks secret scan run in CI (`.github/workflows/ci.yml`) on every push and pull request; CodeQL runs in `.github/workflows/codeql.yml`.

## Notes / current scope

- Only Gmail is wired up right now. Outlook/generic IMAP would need a second connector in `lib/` behind the same interface.
- Spam detection is a heuristic pre-filter (keywords, all-caps subjects, presence of `List-Unsubscribe`) followed by a Gemini pass to cut false positives. With AI features off, the heuristic alone decides. It only looks at messages sitting in the inbox, not ones already in Junk.
- Uses `gemini-3.5-flash-lite` on the paid tier; see [Gemini API pricing](https://ai.google.dev/pricing). The daily AI budgets (`AI_CALLS_*`) cap spend, and every model call logs one `ai_usage` line (feature, model, token counts, latency, outcome; no email content). Run `npm run eval` before changing the model or a prompt.
- Legal and compliance: `content/legal.ts` (Privacy Policy and Terms, versioned by `LEGAL_VERSION`), `docs/compliance-records.md`, `docs/incident-response.md`, and `scripts/user-data.mjs` for access and deletion requests.
- Unsubscribe depends on the sender's `List-Unsubscribe` header. Only RFC 8058 one-click senders (`List-Unsubscribe-Post: List-Unsubscribe=One-Click`, which Gmail requires of bulk senders) are unsubscribed by the server; for the rest the card opens the sender's page or a prefilled email for you to finish. A sender with no header shows "This sender doesn't offer an unsubscribe option."
- Access tokens are refreshed automatically in the background (`auth.ts`, `lib/google-auth.ts`); a session stays active as long as you keep using the app, and only expires after 12 hours of inactivity or if you sign out / revoke access.
- Security controls and the operator checklist are in [`SECURITY.md`](SECURITY.md).
- No packaging step yet (Phase 4 from the original spec — Electron/Tauri) since this runs fine as a plain web app in any browser. See `docs/scope-decision-gmail-only.md` for the reasoning behind the Gmail-only, browser-based scope vs. the original cross-platform ask.
