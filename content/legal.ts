// Legal documents for Inbox Buddy, prepared for attorney review before
// publication. LEGAL_VERSION gates the in-app consent screen: bump it
// whenever the substance of either document changes so users are asked
// to re-agree.

export const LEGAL_VERSION = "2026-09-23";
export const LEGAL_LAST_UPDATED = "September 23, 2026";
export const CONTACT_EMAIL = "t@thomasewright.com";
export const COMPANY_NAME = "Wright AI Solutions LLC";

export const PRIVACY_POLICY = `
**Last updated:** ${LEGAL_LAST_UPDATED}

This Privacy Policy explains how Inbox Buddy ("Inbox Buddy," "we," "us," or "our"), a product of ${COMPANY_NAME} ("Company"), collects, uses, and discloses information when you use the Inbox Buddy service (the "Service").

## 1. Who this policy covers

This policy applies to anyone who connects a Gmail account to Inbox Buddy ("you," "user"). If you use Inbox Buddy on behalf of an organization (for example, a law firm), you confirm you have authority to connect that organization's mailbox and to agree to this policy and our Terms of Service on the organization's behalf. We do not currently have a separate signed data processing agreement for organizational customers; if your organization requires one before connecting a mailbox, contact us first at ${CONTACT_EMAIL}.

## 2. Information we access

When you connect your Gmail account, you grant Inbox Buddy the following Google OAuth permissions:

- **Read access** to your Gmail messages ("gmail.readonly")
- **Modify access**, used only to move a message to Trash or remove it from your Inbox when you choose to Delete or Unsubscribe from a sender ("gmail.modify")

Specifically, for messages received in roughly the last 24 hours, Inbox Buddy retrieves the sender, subject line, a short preview snippet, the date, and the full message body content. The full body is loaded into server memory while your summary is generated, but it is not sent to Google's Gemini API and is not stored — only the sender, subject line, and short preview snippet are sent for AI processing (see Section 3).

We do not access your Gmail account except when you are actively using the Service.

## 3. How we use your information, and who we share it with

We use the information above only to operate the Service:

- **AI-generated summary and spam detection.** The sender, subject line, and short preview snippet of your recent messages are sent to Google's Gemini API, a third-party AI service operated by Google, to generate your daily summary and to help identify messages that are likely spam. This is the only third party that receives any of your email content.

  As of the date of this policy, this feature uses Google's standard, no-cost Gemini API tier. Under Google's published terms for that tier, Google may use content submitted through it to improve its own products — this differs from Google's paid tiers, which carry a no-training commitment. We have not entered into a separate data processing agreement with Google for this use. **If your use of Inbox Buddy involves confidential, privileged, or otherwise legally sensitive email, you should not rely on this Service until that changes.** We intend to move to a paid, no-training tier before onboarding any customer whose email carries that kind of sensitivity, but as of this policy's date that change has not yet been made.

- **Taking the actions you request.** When you click Delete, we ask Gmail to move that message to Trash. When you click Unsubscribe, we send a request to the unsubscribe link the sender itself published in that message's headers — we cannot guarantee the sender actually honors it. Ignore takes no action on your mailbox.

- **Authentication.** Google handles your sign-in; we never see or store your Google password. We receive and use a Google-issued access token, scoped as described above, solely to make the Gmail API calls described in this policy.

We do not sell your information. We do not share your email content with any party other than Google, as described above, and we do not use your email content for advertising.

## 4. What we store

Inbox Buddy does not currently maintain a database of your email content. Message data is retrieved from Gmail, processed in server memory for the duration of a single request, and discarded — it is not written to disk or retained by us after your summary or spam list is generated.

We do retain, for the duration of your signed-in session:

- Your Google account identifier, name, and email address (for display and authentication)
- Your Google OAuth access token (used to make Gmail API calls on your behalf), stored in an encrypted session cookie
- The fact that you agreed to this Privacy Policy and our Terms of Service, and the version and date you agreed

We do not currently keep a durable log of Delete or Unsubscribe actions (who did what, to which message, when) beyond standard hosting-platform request logs.

## 5. Data retention

Because we do not independently store your email content, its retention is governed by Gmail's own retention policies, including Gmail's Trash retention period after you delete a message through Inbox Buddy. Your session data (Section 4) is retained only for the life of your signed-in session, which currently lasts up to approximately one hour before you need to sign in again.

## 6. Your choices and rights

You can disconnect Inbox Buddy at any time from your [Google Account permissions page](https://myaccount.google.com/permissions) — this immediately invalidates our access token and stops all access to your mailbox.

To ask a question, request information about what we've processed, or raise a concern, contact us at ${CONTACT_EMAIL}. We will respond within 30 days.

## 7. Children's privacy

Inbox Buddy is not directed to, and is not knowingly used by, children under 18.

## 8. Security

We use industry-standard practices including encrypted connections (HTTPS), OAuth-based authentication, and encrypted session storage. We have not yet completed a dedicated third-party security audit of this Service.

## 9. Third-party services

Your use of Inbox Buddy also involves Google's Gmail API and Gemini API, each governed by Google's own terms and privacy policy:

- Google Privacy Policy: https://policies.google.com/privacy
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy

Inbox Buddy's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.

## 10. International data transfers

Inbox Buddy is hosted in the United States (via Vercel), and Google's infrastructure may process data in the United States or other countries where Google operates. By using the Service, you consent to this transfer and processing.

## 11. Changes to this policy

We may update this Privacy Policy from time to time. If we make a material change, we will update the "Last updated" date above and, where required, ask you to re-agree before continuing to use the Service.

## 12. Contact us

Questions about this policy can be sent to ${CONTACT_EMAIL}.
`.trim();

export const TERMS_OF_SERVICE = `
**Last updated:** ${LEGAL_LAST_UPDATED}

These Terms of Service ("Terms") govern your access to and use of Inbox Buddy (the "Service"), provided by ${COMPANY_NAME} ("Company," "we," "us"). By connecting your Gmail account and using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Service.

## 1. Eligibility and authority

You must be at least 18 years old to use the Service. If you connect a Gmail account that is not your own, or that belongs to an organization, you confirm that you are authorized to do so and to grant Inbox Buddy the access described in our Privacy Policy.

## 2. What the Service does

Inbox Buddy connects to your Gmail account and:

- Generates an AI-written summary of recent messages
- Identifies inbox messages that are likely spam and displays them as cards
- Lets you Delete a message (moves it to Gmail Trash), attempt to Unsubscribe from a sender (using that sender's own published unsubscribe link), or Ignore a card (no action taken)

## 3. AI-generated content — important disclaimer

Summaries and spam classifications are generated automatically by a third-party AI model (see our Privacy Policy) and **may be incomplete, inaccurate, miscategorized, or may omit information — including time-sensitive, urgent, or important messages.**

**You are solely responsible for reviewing your own inbox for anything time-sensitive, urgent, legally significant, or otherwise important. Do not rely on Inbox Buddy's summary as your only source of information about your email.** This is especially important if you use Inbox Buddy in a professional context — for example, legal, medical, or financial work — where missing a communication could have serious consequences.

## 4. Actions you authorize

By clicking Delete or Unsubscribe, you are directly instructing us to take that action on your Gmail account through Google's API, on your behalf, immediately:

- **Delete** moves the message to your Gmail Trash. It is not permanently destroyed at that moment (Gmail's own Trash retention applies), but Inbox Buddy does not provide an "undo" within the app itself.
- **Unsubscribe** sends a request to the link the sender published in their message. We do not control, and cannot guarantee, whether the sender actually stops emailing you.

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

Inbox Buddy is a productivity tool. It does not provide legal, medical, financial, or other professional advice, and nothing it generates should be treated as such. If you use Inbox Buddy in a professional or regulated context — including the practice of law — you remain solely responsible for complying with any professional conduct, confidentiality, or ethical obligations that apply to you, including obligations regarding the use of AI tools and third-party services with client or case information. Inbox Buddy does not evaluate or certify compliance with any such obligations.

## 8. Disclaimer of warranties

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.

## 9. Limitation of liability

TO THE FULLEST EXTENT PERMITTED BY LAW, ${COMPANY_NAME.toUpperCase()} WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, REVENUE, OR PROFITS, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR THE SERVICE WILL NOT EXCEED ONE HUNDRED DOLLARS ($100) OR THE AMOUNT YOU PAID US FOR THE SERVICE IN THE TWELVE (12) MONTHS BEFORE THE CLAIM AROSE, WHICHEVER IS GREATER.

## 10. Indemnification

You agree to indemnify and hold ${COMPANY_NAME} harmless from any claims, damages, liabilities, and expenses (including reasonable attorneys' fees) arising from your use of the Service, your violation of these Terms, or your violation of any rights of a third party, including anyone whose information appears in email you process through the Service.

## 11. Termination

You may stop using the Service at any time by revoking Google's access. We may suspend or terminate the Service, or your access to it, at any time, including for violation of these Terms or Section 5 (Acceptable Use).

## 12. Changes to these Terms

We may update these Terms from time to time. If we make a material change, we will update the "Last updated" date above and, where required, ask you to re-agree before continuing to use the Service.

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
