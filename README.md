# Inbox Buddy

A daily email summary + spam flashcards front end, built on Gmail (works from any browser on Windows or Mac — no native mail client integration needed).

## What it does

- **Today's Summary tab** — pulls every message from the last 24 hours and asks Gemini for a short, skimmable summary of what actually matters.
- **Spam Flashcards tab** — flags inbox messages (not already in Junk/Spam) that look promotional or spammy, shown as cards with sender + subject. Each card has **Delete**, **Unsubscribe** (uses the message's `List-Unsubscribe` header when present), and **Ignore**.

## Setup

### 1. Google Cloud / Gmail API

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com).
2. Enable the **Gmail API** (APIs & Services → Library).
3. Configure the **OAuth consent screen** (External is fine for personal use) and add your Google account as a test user.
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
- `GEMINI_API_KEY` — free-tier key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
- `DATABASE_URL` — optional. Powers the Delete/Unsubscribe/Ignore/spam-classification audit log (`lib/audit.ts`). On Vercel: Storage tab → Create Database → search "Neon"/"Postgres" in the Marketplace. Without it, audit logging silently no-ops rather than breaking the app; `GET /api/health` (signed in) reports whether it's actually configured and reachable.

### 3. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google.

### 4. Tests

```bash
npm test        # Vitest — SSRF blocklist, spam heuristic, header parsing, caching, token refresh
npm run lint
npx tsc --noEmit
```

All three also run in CI (`.github/workflows/ci.yml`) on every push and pull request.

## Notes / current scope

- Only Gmail is wired up right now. Outlook/generic IMAP would need a second connector in `lib/` behind the same interface.
- Spam detection is a heuristic pre-filter (keywords, all-caps subjects, presence of `List-Unsubscribe`) followed by a Gemini pass to cut false positives. It only looks at messages sitting in the inbox, not ones already in Junk.
- Uses `gemini-3.5-flash-lite`, which is free (500 requests/day) as of writing — check [Google AI Studio pricing](https://ai.google.dev/pricing) if that changes.
- "Unsubscribe" only works when the sender includes a `List-Unsubscribe` header with an HTTP(S) link (most legitimate marketing senders do; mailto-only or link-less senders will show a disabled button).
- Access tokens are refreshed automatically in the background (`auth.ts`, `lib/google-auth.ts`); a session stays active as long as you keep using the app, and only expires after 30 days of inactivity or if you sign out / revoke access.
- No packaging step yet (Phase 4 from the original spec — Electron/Tauri) since this runs fine as a plain web app in any browser. See `docs/scope-decision-gmail-only.md` for the reasoning behind the Gmail-only, browser-based scope vs. the original cross-platform ask.
