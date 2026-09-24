# Inbox Buddy

A daily email summary + spam flashcards front end, built on Gmail (works from any browser on Windows or Mac — no native mail client integration needed).

## What it does

- **Today's Summary tab** — pulls every message from the last 24 hours and asks Gemini for a short, skimmable summary of what actually matters (or, with AI features off, lists the messages to check and the likely bulk mail using simple rules).
- **Spam Flashcards tab** — flags inbox messages (not already in Junk/Spam) that look promotional or spammy, shown as cards with sender + subject. Each card has **Delete**, **Unsubscribe** (uses the message's `List-Unsubscribe` header when present), and **Ignore**.

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
- `DATABASE_URL` — optional. Powers the audit log, the shared encrypted cache, shared rate limits and session revocation. Create the schema with `npm run db:migrate` (owner connection in `MIGRATION_DATABASE_URL`) and point `DATABASE_URL` at the least-privilege app role; see [`SECURITY.md`](SECURITY.md#database-setup). Without it, those features fall back to memory or no-op; `GET /api/health` (signed in) reports whether it's configured and reachable.
- `ALERT_WEBHOOK_URL` — optional Slack/Discord-style webhook for security alerts.

### 3. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

### 4. Tests

```bash
npm test        # Vitest — SSRF, CSRF, input validation, rate limits, prompt-injection guards, caching, token refresh
npm run lint
npx tsc --noEmit
```

All three, plus `npm audit` and a gitleaks secret scan, run in CI (`.github/workflows/ci.yml`) on every push and pull request; CodeQL runs in `.github/workflows/codeql.yml`.

## Notes / current scope

- Only Gmail is wired up right now. Outlook/generic IMAP would need a second connector in `lib/` behind the same interface.
- Spam detection is a heuristic pre-filter (keywords, all-caps subjects, presence of `List-Unsubscribe`) followed by a Gemini pass to cut false positives. With AI features off, the heuristic alone decides. It only looks at messages sitting in the inbox, not ones already in Junk.
- Uses `gemini-3.5-flash-lite` on the paid tier; see [Gemini API pricing](https://ai.google.dev/pricing). The daily AI budgets (`AI_CALLS_*`) cap spend.
- Legal and compliance: `content/legal.ts` (Privacy Policy and Terms, versioned by `LEGAL_VERSION`), `docs/compliance-records.md`, `docs/incident-response.md`, and `scripts/user-data.mjs` for access and deletion requests.
- "Unsubscribe" only works when the sender includes a `List-Unsubscribe` header with an HTTP(S) link (most legitimate marketing senders do; mailto-only or link-less senders will show a disabled button).
- Access tokens are refreshed automatically in the background (`auth.ts`, `lib/google-auth.ts`); a session stays active as long as you keep using the app, and only expires after 12 hours of inactivity or if you sign out / revoke access.
- Security controls and the operator checklist are in [`SECURITY.md`](SECURITY.md).
- No packaging step yet (Phase 4 from the original spec — Electron/Tauri) since this runs fine as a plain web app in any browser. See `docs/scope-decision-gmail-only.md` for the reasoning behind the Gmail-only, browser-based scope vs. the original cross-platform ask.
