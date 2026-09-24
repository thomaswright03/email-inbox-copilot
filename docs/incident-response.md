# Incident Response

**Product:** Inbox Buddy (`email-inbox-copilot`) · **Entity:** Wright AI Solutions LLC
**Incident owner:** Thomas Wright (t@thomasewright.com). The owner decides whether an
event is a breach and who is notified.

Not legal advice. Notification deadlines below are taken from the sources named and must
be confirmed with counsel for each incident; laws differ by where affected people live.

## 1. What counts as an incident

Any suspected unauthorized access to, or loss of: Google OAuth tokens or session cookies,
`AUTH_SECRET`, `GEMINI_API_KEY`, database credentials, the database itself (cache, audit,
consent or session tables), or Gmail data of any user. Also any Gmail action (Delete,
Unsubscribe) a user says they did not take.

## 2. First hour: contain

1. Open a dated incident note (who, what, when noticed, how) in a private place.
2. Rotate whatever may be exposed, per SECURITY.md "Rotating credentials". Rotating
   `AUTH_SECRET` signs every user out and makes the encrypted cache unreadable.
3. Revoke affected users' sessions: `node scripts/revoke-sessions.mjs <google-account-id>`
   (SECURITY.md), or rotate `AUTH_SECRET` for everyone.
4. If Gmail access itself may be abused, take the production deployment offline (in
   Vercel, roll back or pause it), and ask affected users to remove the app at
   https://myaccount.google.com/permissions.

## 3. Evidence to preserve

| Source | What it shows | Kept for |
|---|---|---|
| `audit_log` table (owner connection) | Sign-ins, rejected sign-ins, sign-outs, consent, token-refresh failures, rejected sessions, rate limiting, every Delete/Unsubscribe/Ignore and spam flag, by Google account id and time | 90 days, so export it early |
| Vercel runtime logs (`"level":"audit"`, `"level":"security"`, `"level":"alert"` lines) | The same events plus blocked SSRF and cross-site requests | The Vercel plan's log retention (short), so export immediately |
| `ALERT_WEBHOOK_URL` channel | Alert history | The channel's retention |
| Google Cloud console (OAuth client, API key usage) | Token and key use | Google's retention |
| GitHub (commits, Actions logs, secret-scanning alerts) | Code and CI changes | GitHub's retention |

## 4. Who must be told, and by when

| Who | When | Source |
|---|---|---|
| Affected users who are Arizona residents | Within 45 days of determining a breach of "personal information" occurred (includes account credentials allowing access to an online account) | A.R.S. §18-552 (read from secondary sources, unverified against the statute; confirm with counsel) |
| Arizona Attorney General and the three largest consumer reporting agencies | Also within 45 days, if more than 1,000 Arizona residents are notified | A.R.S. §18-552 (as above) |
| Affected users in other US states | Each state's breach law; many require notice "without unreasonable delay" and some set 30 to 60 days | State statutes: confirm with counsel for each state involved |
| Google | Promptly, for any incident involving Google user data obtained through Google APIs | Google API Services User Data Policy; Google API Terms of Service (confirm current wording) |
| Vendors involved (Vercel, Neon, Google Cloud) | As soon as practical, to preserve their logs | Their DPAs (docs/compliance-records.md) |

The service is limited to invited US users (Terms section 1), so GDPR's 72-hour rule is
not expected to apply; if that changes, add it here.

## 5. Afterwards

- Write up what happened, the root cause and the fix; link the fixing commit.
- If the incident changed what data is held or who receives it, update the Privacy Policy
  (`content/legal.ts`) and bump `LEGAL_VERSION`.
- Review this document and `docs/compliance-records.md`.
