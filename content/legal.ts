// Legal documents for Inbox Buddy, prepared for attorney review before
// publication. LEGAL_VERSION gates the in-app consent screen: bump it
// whenever the substance of either document changes so users are asked
// to re-agree.

export const LEGAL_VERSION = "2026-09-24.4";
const LEGAL_LAST_UPDATED = "September 24, 2026";
export const CONTACT_EMAIL = "t@thomasewright.com";
const COMPANY_NAME = "Wright AI Solutions LLC";

// Every statement below about what the app stores, for how long, and who
// receives it is checked against the code: see docs/architecture.md and
// SECURITY.md. Change them together.
export const PRIVACY_POLICY = `
**Last updated:** ${LEGAL_LAST_UPDATED}

This Privacy Policy explains how Inbox Buddy ("Inbox Buddy," "we," "us," or "our"), a product of ${COMPANY_NAME} ("Company"), collects, uses, stores, and discloses information when you use the Inbox Buddy service (the "Service").

## 1. Who this policy covers

This policy applies to anyone who connects a Gmail account to Inbox Buddy ("you," "user"), and describes what we do with information about the people who email you, which reaches us as part of your messages.

Inbox Buddy is available only to people in the United States whom we have invited; sign-in is limited to the Google accounts we have approved. It is not intended for mailboxes that carry attorney-client privileged, medical (health), or financial-account correspondence, or other information subject to professional-confidentiality or regulatory duties. Please do not connect such a mailbox. If you connect a mailbox that belongs to an organization, you confirm you have authority to do so and to agree to this policy and our Terms of Service on its behalf. We do not currently offer a signed data processing agreement; if your organization needs one, contact us at ${CONTACT_EMAIL} before connecting.

## 2. What Google lets us access, and what we actually use

When you sign in, you grant Inbox Buddy these Google permissions:

- **openid, email, profile:** your Google account id, name, email address and profile picture, used to sign you in.
- **gmail.modify:** Google describes this permission as letting an app read, compose, send and change your email and labels, everything except permanently deleting messages without going through Trash. It is the narrowest Google permission that lets Inbox Buddy move a message to Trash or out of your Inbox.

Although gmail.modify permits more, Inbox Buddy uses it only to:

- list the messages you received in roughly the last 24 hours (up to 50);
- read each message's metadata: the sender, subject line, date, the sender's published unsubscribe link (the List-Unsubscribe header), which Gmail labels it has, and the short preview snippet Gmail itself generates;
- move a message to Trash when you click Delete; and
- remove a message from your Inbox (archive it) when you click Unsubscribe.

Inbox Buddy never retrieves full message bodies or attachments, and never composes, sends, or permanently deletes email. We access your Gmail only while you are using the Service.

## 3. How we use information

- **Your daily summary and spam flags.** When AI features are on, the sender, subject line, and preview snippet of your recent messages are sent to Google's Gemini API to write your summary and to decide which messages look like spam. When AI features are off, Inbox Buddy instead builds a simple summary and spam list on our own servers using fixed rules (for example, messages with an unsubscribe link or common marketing wording), and nothing is sent to Gemini. The app labels which kind of result you are looking at.
- **Taking the actions you request.** Delete moves the message to Gmail Trash. Unsubscribe, for senders that support one-click unsubscribe, sends a request to the unsubscribe web address the sender published in that message, and then archives the message (removes it from your Inbox; it stays in All Mail); for other senders it opens the sender's own unsubscribe page, or a prefilled unsubscribe email in Gmail, for you to complete yourself. Not spam takes no action on your mailbox: we remember the message's Gmail id so it isn't flagged again. Undo reverses a Delete (moves the message back out of Trash), the archive step of an Unsubscribe (moves the message back to your Inbox), or a Not spam.
- **Security and abuse prevention.** We count requests per account to enforce usage limits, and keep the activity log described in Section 5.

We do not sell your information, use it for advertising, or use it to train or improve any AI model.

## 4. Who receives information

We use these service providers, each only to run the Service:

| Provider | What it receives | Why |
|---|---|---|
| Google (Gmail API) | Your OAuth token and the requests described in Section 2 | Reading metadata and taking the actions you request |
| Google (Gemini API, paid tier), only when AI features are on | Sender, subject line and preview snippet of your recent messages | Writing your summary and spam flags |
| Vercel Inc. (hosting) | All requests to the Service, and our server logs (Section 5) | Running the app |
| Neon Inc. (database) | The stored data listed in Section 5 | Storing it |
| The sender of a message you unsubscribe from | A request to the unsubscribe address it published | Unsubscribing you; it learns that the request was made |

**Gemini.** Inbox Buddy sends Gmail data to Gemini only under Google's paid Gemini API terms, under which Google does not use prompts or responses to improve its products. The app is built so that AI features stay off unless the deployment is configured for a paid, billing-enabled Google Cloud project; if they are off, nothing is sent to Gemini (see Section 3).

We may also send our own operations team automatic security alerts (for example, "rate limit reached"). These contain an event name and never any personal information or email content.

We may disclose information if required by law, or to a successor if the Company's business is transferred, subject to this policy.

## 5. What we store, and for how long

Everything below is held in one database, hosted by Neon in the United States, or in the Service's server logs, hosted by Vercel.

| Data | Where | Kept for |
|---|---|---|
| Your recent messages' sender, subject, preview snippet and date, and your summary or spam list | Database cache, encrypted (AES-256-GCM) | 5 minutes, so reloading the page doesn't re-read your mailbox; deleted immediately when you sign out |
| When AI features are on, the AI spam check result for each recent message: the Gmail message id, whether it looked like spam, and the fixed reason shown on its card | Database cache, encrypted (AES-256-GCM) | 26 hours, so each message is sent to Gemini only once; deleted immediately when you sign out |
| Your Google account id, name, email address, profile picture link, and Google access and refresh tokens | An encrypted cookie in your browser, not our database | Until you sign out, or 12 hours after you last used the Service |
| Your Google account id and a session number | Database (sessions table) | 30 days after your last sign-in; it lets us end all your sessions at once |
| Record of your agreement: Google account id, the version of these documents you agreed to, and when | Database (consent records) | 3 years from when you agreed, so we can show what you agreed to |
| Messages you marked Not spam: your Google account id and the Gmail message id | Database (Not spam list) | 7 days, long enough to cover the 24 hours of mail the Service shows |
| Activity log: Google account id, the event, the Gmail message id where there is one, a fixed description, and the time. Events: sign-in, rejected sign-in attempt (including by people who are not users), sign-out, agreement to these documents, failed token refresh, message flagged as spam, Delete, Unsubscribe, Not spam, Undo | Database (activity log) | 90 days |
| Usage counters: your Google account id and a count per time window | Database (rate limits) | 2 days |
| Server logs: Google account id, error messages with credentials removed, the activity-log events above, and security events (for example a rejected session, a usage limit reached, or a blocked request) | Vercel logs | The runtime-log retention of our Vercel plan |

None of the stored data, the activity log included, contains the content of your messages outside the 5-minute encrypted cache.

Messages you Delete stay in Gmail Trash under Gmail's own rules. We do not control or keep copies of your mailbox.

## 6. Your choices and rights

- **Disconnect.** Signing out revokes our Google access token, ends your sessions everywhere, and deletes your cached data. You can also remove Inbox Buddy at any time from your [Google Account permissions page](https://myaccount.google.com/permissions).
- **Get a copy, or have it deleted.** Sign in, open **Your data** at the bottom of the page, and choose "request a copy" or "request deletion". This opens an email to ${CONTACT_EMAIL} with your account id and a request code that shows the request comes from your account; send it from the address you use with Inbox Buddy. We store nothing that links an email address to an account, so we can't act on a request without that code. We answer within 30 days. Deletion removes your rows from every table listed in Section 5; server logs expire on their own schedule. If you can no longer sign in, email us anyway and we will work with you to confirm the request.
- **If someone who uses Inbox Buddy has emailed you**, and you want to ask about information from your message, contact us at the same address.

## 7. Age

Inbox Buddy is not intended for anyone under 18, and you must confirm you are 18 or older before using it.

## 8. Security

We use encrypted connections (HTTPS), Google sign-in (we never see your Google password), encrypted session cookies, encrypted cached data, and a database account that cannot read the activity or consent records. We have not yet completed an independent security audit of the Service. If a security incident affects your information, we will notify you as required by law.

## 9. Google API data

Inbox Buddy's use and transfer of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including its Limited Use requirements. In particular, Gmail data is used only to provide the features described above, is not used for advertising, is not sold, is not read by people except with your permission or where required for security or by law, and is not used to train AI models.

Google's own processing is governed by the [Google Privacy Policy](https://policies.google.com/privacy).

## 10. Where data is processed

Inbox Buddy and its database are hosted in the United States. Google may process data sent to the Gmail and Gemini APIs in the United States or other countries where it operates.

## 11. Changes to this policy

If we make a material change, we will update the "Last updated" date above and ask you to agree again before you continue to use the Service.

## 12. Contact us

Questions about this policy can be sent to ${CONTACT_EMAIL}.
`.trim();

export const TERMS_OF_SERVICE = `
**Last updated:** ${LEGAL_LAST_UPDATED}

These Terms of Service ("Terms") govern your access to and use of Inbox Buddy (the "Service"), provided by ${COMPANY_NAME} ("Company," "we," "us"). By connecting your Gmail account and using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Service.

## 1. Who can use Inbox Buddy

You must be at least 18 years old and located in the United States, and you must have been invited by us: only Google accounts we have approved can sign in. If you connect a Gmail account that is not your own, or that belongs to an organization, you confirm that you are authorized to do so and to grant Inbox Buddy the access described in our Privacy Policy.

Inbox Buddy is not intended for mailboxes that carry attorney-client privileged, medical (health), or financial-account correspondence, or other information subject to professional-confidentiality or regulatory duties, and you agree not to connect such a mailbox.

## 2. What the Service does

Inbox Buddy connects to your Gmail account and:

- Generates a summary of recent messages, written by AI when AI features are on, or built from simple rules when they are off
- Identifies inbox messages that are likely spam and displays them as cards
- Lets you Delete a message (moves it to Gmail Trash), Unsubscribe from a sender (for senders that support one-click unsubscribe, sends a request to that sender's own published unsubscribe address, then archives the message; for other senders, opens their unsubscribe page or a prefilled unsubscribe email for you to complete), or mark a card Not spam (no action on your mailbox; the message isn't flagged again)

## 3. AI-generated content — important disclaimer

Summaries and spam classifications are generated automatically, by a third-party AI model or by simple rules (see our Privacy Policy), and **may be incomplete, inaccurate, miscategorized, or may omit information — including time-sensitive, urgent, or important messages.**

**You are solely responsible for reviewing your own inbox for anything time-sensitive, urgent, legally significant, or otherwise important. Do not rely on Inbox Buddy's summary as your only source of information about your email.** This is especially important if you use Inbox Buddy for work, where missing a communication could have serious consequences.

## 4. Actions you authorize

By clicking Delete or Unsubscribe, you are directly instructing us to take that action on your Gmail account through Google's API, on your behalf, immediately:

- **Delete** moves the message to your Gmail Trash. It is not permanently destroyed at that moment (Gmail's own Trash retention applies). Inbox Buddy offers Undo for a few seconds afterwards; after that, restore it from Gmail Trash.
- **Unsubscribe**, for senders that support one-click unsubscribe, sends a request to the unsubscribe address the sender published in their message and, if the sender accepts it, archives that message (removes it from your Inbox; it stays in All Mail). For other senders, Inbox Buddy opens the sender's own unsubscribe page or a prefilled unsubscribe email, and you complete it there. We do not control, and cannot guarantee, whether the sender actually stops emailing you, and the unsubscribe request cannot be undone (Undo only moves the message back to your Inbox).

Only click these buttons for messages and senders you intend to act on.

## 5. Acceptable use

You agree not to:

- Use the Service to access a Gmail account you are not authorized to access
- Attempt to interfere with, disrupt, or reverse-engineer the Service
- Use the Service in a way that violates any law or third party's rights, including Google's own terms of service

We may suspend or terminate access for any account we reasonably believe violates this section.

## 6. Your Google account

Your Google account and the emails in it remain governed by Google's own terms. We are not responsible for Google's availability, changes to the Gmail API, or actions Google takes on your account. You can revoke Inbox Buddy's access at any time from your [Google Account permissions page](https://myaccount.google.com/permissions).

## 7. No professional advice

Inbox Buddy is a productivity tool. It does not provide legal, medical, financial, or other professional advice, and nothing it generates should be treated as such. Inbox Buddy is not designed for, and does not evaluate or certify compliance with, the professional-conduct, confidentiality, or ethical obligations that apply to regulated professions (Section 1). If you use it for work, you remain solely responsible for any such obligations that apply to you.

## 8. Disclaimer of warranties

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.

## 9. Limitation of liability

TO THE FULLEST EXTENT PERMITTED BY LAW, ${COMPANY_NAME.toUpperCase()} WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, REVENUE, OR PROFITS, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICE WILL NOT EXCEED ONE HUNDRED DOLLARS ($100) OR THE AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM AROSE, WHICHEVER IS GREATER.

## 10. Indemnification

You agree to indemnify and hold ${COMPANY_NAME} harmless from any claims, damages, liabilities, and expenses (including reasonable attorneys' fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party, including anyone whose information appears in email you process through the Service.

## 11. Termination

You may stop using the Service at any time by revoking Google's access. We may suspend or terminate the Service, or your access to it, at any time, including for violation of these Terms or Section 5 (Acceptable Use).

## 12. Changes to these Terms

We may update these Terms from time to time. If we make a material change, we will update the "Last updated" date above and ask you to agree again before you continue to use the Service.

## 13. Governing law and disputes

These Terms are governed by the laws of the State of Arizona, without regard to its conflict-of-laws principles.

**Agreement to arbitrate.** You and ${COMPANY_NAME} agree that any dispute, claim, or controversy arising out of or relating to these Terms or the Service (a "Dispute") will be resolved by binding individual arbitration, rather than in court, except as set out below. This includes Disputes based in contract, tort, statute, or any other legal theory, regardless of whether the Dispute arose before or after you agreed to these Terms.

**Exceptions.** Either party may bring an individual action in small claims court for a qualifying Dispute, and either party may seek injunctive or other equitable relief in court to prevent actual or threatened infringement, misappropriation, or violation of intellectual property or confidentiality obligations.

**Arbitration procedure.** Arbitration will be administered by the American Arbitration Association ("AAA") under its Consumer Arbitration Rules (or, if neither party is a consumer, its Commercial Arbitration Rules), by a single arbitrator, in Arizona or by videoconference if the arbitrator permits. The arbitrator's decision is final and binding, and judgment on it may be entered in any court of competent jurisdiction. Payment of AAA filing, administrative, and arbitrator fees is governed by the AAA's rules, except that if those rules would require you to pay more than a comparable court filing fee, we will reimburse the difference upon request.

**Class action waiver.** YOU AND ${COMPANY_NAME.toUpperCase()} AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN AN INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING. Unless both parties agree otherwise in writing, the arbitrator may not consolidate more than one person's claims and may not otherwise preside over any form of a representative or class proceeding.

**Right to opt out.** You may opt out of this arbitration agreement by sending written notice to ${CONTACT_EMAIL} within 30 days of first agreeing to these Terms, stating your name, the Google account email you use with the Service, and that you opt out of arbitration. If you opt out, neither you nor we are bound by the arbitration or class-action-waiver provisions above, and any Dispute will instead be resolved as described below.

**Venue (if arbitration does not apply).** If the arbitration agreement above is found unenforceable or does not apply — including because you opted out — any Dispute will be brought exclusively in the state or federal courts located in Arizona, and you consent to personal jurisdiction there.

**Severability.** If the class action waiver is found unenforceable as to a particular claim or request for relief, that claim or request must be severed from arbitration and brought in court, with the remainder of this section remaining in force.

## 14. Contact us

Questions about these Terms can be sent to ${CONTACT_EMAIL}.
`.trim();
