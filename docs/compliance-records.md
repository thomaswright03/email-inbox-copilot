# Compliance Records

**Product:** Inbox Buddy (`email-inbox-copilot`)
**Operating entity:** Wright AI Solutions LLC
**Owner:** Thomas Wright

This file is the record of business decisions, vendor terms and Google requirements that
the code can't evidence on its own. Anything marked **NEEDS THOMAS** is an open item that
only Thomas can complete: nobody else should fill it in. Update the entry, date it, and
sign the section at the end when an item changes.

Not legal advice. The Terms of Service and Privacy Policy (`content/legal.ts`) are
marked for attorney review before publication.

## 1. Gemini tier (AI processing of Gmail data)

Gmail-derived data (sender, subject and snippet of today's inbox messages; with
`AI_DEADLINE_DETECTION=1` only, also their Date header and the user's local date, time and
time zone) may be sent only to Gemini under Google's
**paid** API terms, where Google does not use prompts or responses to improve its
products. The code enforces this: AI is off, and nothing is sent to Gemini, unless
`GEMINI_PAID_TIER_PROJECT` is set (`lib/ai.ts`, `aiEnabled`). Setting it is the
attestation below.

| Item | Value |
|---|---|
| Google Cloud project id (billing enabled) | **NEEDS THOMAS** |
| Date billing was enabled on that project | **NEEDS THOMAS** |
| Date `GEMINI_PAID_TIER_PROJECT` was set in production | **NEEDS THOMAS** |
| Gemini API Additional Terms version accepted (ai.google.dev/gemini-api/terms) | **NEEDS THOMAS** |
| Old free-tier API keys deleted (date) | **NEEDS THOMAS** |

Until every row is filled, production runs with AI features off (rule-based summary and
spam list).

## 2. Vendors that receive personal data

| Vendor | Receives | Terms / DPA | Accepted on |
|---|---|---|---|
| Google (Gmail API, OAuth) | OAuth tokens; Gmail metadata requests | Google API Services User Data Policy; Google Workspace API User Data and Developer Policy | **NEEDS THOMAS** |
| Google (Gemini API, paid) | Sender, subject, snippet (only with AI on); Date header and the user's local date, time and time zone only with `AI_DEADLINE_DETECTION=1` too (off by default) | Gemini API Additional Terms (paid services); Google Cloud Data Processing Addendum | **NEEDS THOMAS** |
| Vercel Inc. | All requests; runtime logs with Google account ids | Vercel DPA (vercel.com/legal/dpa) | **NEEDS THOMAS** |
| Neon Inc. | Database: encrypted 5-minute cache and 26-hour spam-verdict cache, audit log, consent records, session versions, Not spam choices, rate-limit counters | Neon DPA (neon.tech/dpa) | **NEEDS THOMAS** |
| Alert webhook (Slack/Discord), optional | Event names only, no personal data | n/a | n/a |

Also **NEEDS THOMAS**: the Vercel plan in use and its runtime-log retention period (the
Privacy Policy section 5 refers to it), and the Neon project's region (the policy says
United States).

## 3. Google OAuth app status

`gmail.modify` is a restricted scope. A public app that requests it needs Google's OAuth
verification and an annual third-party security assessment (Letter of Assessment).
An app in "Testing" status is limited to named test users.

| Item | Value |
|---|---|
| OAuth app publishing status (Testing / In production) | **NEEDS THOMAS** |
| If Testing: the named test users | **NEEDS THOMAS** |
| If In production: verification date, security assessor, Letter of Assessment date | **NEEDS THOMAS** |

## 4. Who the service is for (eligibility and customer scope)

Current defaults, as written in the Terms of Service section 1 and the Privacy Policy
section 1, and enforced where the code can:

- **US only, invitation only.** Production refuses every sign-in unless `ALLOWED_EMAILS`
  is set, and then admits only the listed accounts (`auth.ts`, `isEmailAllowed`).
- **18 or older.** Stated in the Terms; attested on the consent screen checkbox.
- **No privileged, medical or financial-account mailboxes.** Stated in the Terms and
  Privacy Policy and on the consent screen. The code can't detect this; the allowlist is
  the control, so don't allowlist such customers.

| Decision | Value |
|---|---|
| Confirm the US-only, invitation-only eligibility above (or replace it) | **NEEDS THOMAS** |
| Confirm the customer scope above: which partners, and that none is a law firm, healthcare provider, financial adviser or accountant | **NEEDS THOMAS** |
| If any EEA, UK or Swiss user is ever to be onboarded: GDPR position and paid Gemini required | **NEEDS THOMAS** (currently excluded) |

## 5. Retention periods (set in code)

| Data | Period | Where set | Rationale |
|---|---|---|---|
| Encrypted inbox cache (message metadata, briefing with model text, spam list, triage) | 5 minutes (a triage where a Gemini call failed: 60 seconds); deleted at sign-out | `INBOX_CACHE_TTL_MS` in `lib/inbox.ts`, `TRIAGE_FAILURE_BACKOFF_MS` in `lib/triage.ts` | Avoid re-reading Gmail and re-asking Gemini on reload |
| Encrypted AI spam verdicts (Gmail message id, spam yes/no, fixed reason) | 26 hours; deleted at sign-out | `VERDICT_TTL_MS` in `lib/verdict-cache.ts` | Reuse each email's spam verdict (from the triage call) without asking Gemini again, within the daily AI budget |
| Session cookie | 12 hours idle | `auth.ts` `maxAge` | Cookie carries a refresh token |
| Snooze / Remind me (Gmail message and thread ids, a time) | In the user's browser only (localStorage), never on our servers; until dismissed or Done, at most 7 days after the time | `KEEP_DUE_MS` in `components/dashboard/later.ts` | Gmail's API has no snooze; keeping it in the browser stores nothing new about the user's mail on the server |
| Session-version rows | 30 days after last sign-in | `migrations/002`, `purge_user_sessions` | Only needed while a session can be alive |
| Activity (audit) log | 90 days (`AUDIT_RETENTION_DAYS`, minimum 30; don't raise it without updating the Privacy Policy) | `lib/audit.ts`, `purge_audit_log` | Investigate incidents and disputes |
| Consent records | 3 years | `migrations/002`, `purge_consent_records` | Evidence of what each user agreed to |
| Rate-limit counters | 2 days | `lib/rate-limit.ts` | Enforce limits |
| Not spam choices (Google account id + Gmail message id) | 7 days | `RETENTION_DAYS` in `lib/ignored.ts` | Keep a message the user cleared from being flagged again; the dashboard only covers today's mail (since the user's local midnight) |

Changing any of these requires the same change in the Privacy Policy section 5 and a new
`LEGAL_VERSION`.

## 6. Superseded records

- The Gemini free-tier risk acceptance memo (formerly
  `docs/risk-acceptance-gemini-free-tier.md`): superseded 2026-09-24, never signed, and
  removed from `docs/` so it can't be mistaken for a current record (it and its PDF copy
  remain in git history only). It is not the basis for anything. Replaced by section 1
  above.

## 7. Sign-off

I confirm that the entries above marked as completed are accurate.

Signature: **NEEDS THOMAS**
Name: Thomas Wright
Title: **NEEDS THOMAS**
Date: **NEEDS THOMAS**
