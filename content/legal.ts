// Draft legal documents prepared for attorney review before publication.
// Bracketed [ATTORNEY TO CONFIRM] / [ENGINEERING TO CONFIRM] items are
// open decisions, not filled-in placeholders — resolve them before this
// is treated as final. LEGAL_VERSION gates the in-app consent screen:
// bump it whenever the substance of either document changes so users
// are asked to re-agree.

export const LEGAL_VERSION = "2026-09-23";
export const LEGAL_LAST_UPDATED = "September 23, 2026";

export const PRIVACY_POLICY = `
**Last updated:** ${LEGAL_LAST_UPDATED}

> **Note to reviewing attorney:** this is a first draft, prepared to minimize your review time. Items marked **[ATTORNEY TO CONFIRM]** or **[ENGINEERING TO CONFIRM]** are open decisions that need to be resolved before this is published as final. Everything else describes the Service's actual, current technical behavior as of the date above and should be checked against the live product before publication.

This Privacy Policy explains how Inbox Buddy ("Inbox Buddy," "we," "us," or "our"), a product of **[LEGAL ENTITY NAME — e.g., an Arizona limited liability company]** ("Company"), collects, uses, and discloses information when you use the Inbox Buddy service (the "Service").

## 1. Who this policy covers

This policy applies to anyone who connects a Gmail account to Inbox Buddy ("you," "user"). If you use Inbox Buddy on behalf of an organization (for example, a law firm), you confirm you have authority to connect that organization's mailbox and to agree to this policy and our Terms of Service on the organization's behalf. **[ATTORNEY TO CONFIRM]** whether a separate signed customer agreement / data processing agreement should govern organizational use instead of, or in addition to, this policy.

## 2. Information we access

When you connect your Gmail account, you grant Inbox Buddy the following Google OAuth permissions:

- **Read access** to your Gmail messages ("gmail.readonly")
- **Modify access**, used only to move a message to Trash or remove it from your Inbox when you choose to Delete or Unsubscribe from a sender ("gmail.modify")

Specifically, for messages received in roughly the last 24 hours, Inbox Buddy retrieves: the sender, subject line, a short preview snippet, the date, and — currently — the full message body content. The full body is loaded into server memory to support future features but is not itself sent to any AI provider or stored (see Sections 3 and 4). **[ENGINEERING TO CONFIRM]** we intend to stop retrieving full message bodies and request only headers going forward, which would remove full body content from this list entirely.

We do not access your Gmail account except when you are actively using the Service.

## 3. How we use your information, and who we share it with

We use the information above only to operate the Service:

- **AI-generated summary and spam detection.** The sender, subject line, and short preview snippet of your recent messages are sent to Google's Gemini API, a third-party AI service operated by Google, to generate your daily summary and to help identify messages that are likely spam. This is the only third party that receives any of your email content.

  **[ATTORNEY TO CONFIRM — IMPORTANT]:** As of the date of this policy, this feature uses a standard, no-cost tier of Google's Gemini API. Google's own published terms for that tier may permit Google to use submitted content to improve its products, which differs from paid tiers that carry a no-training commitment. We **[are moving / intend to move / have moved — select one]** to a paid tier with a no-training commitment before this Service is used to process any organization's confidential or privileged correspondence. Do not rely on this Service for confidential, privileged, or legally sensitive email until this item is resolved and this bracket is removed.

- **Taking the actions you request.** When you click Delete, we ask Gmail to move that message to Trash. When you click Unsubscribe, we send a request to the unsubscribe link the sender itself published in that message's headers — we cannot guarantee the sender actually honors it. Ignore takes no action on your mailbox.

- **Authentication.** Google handles your sign-in; we never see or store your Google password. We receive and use a Google-issued access token, scoped as described above, solely to make the Gmail API calls described in this policy.

We do not sell your information. We do not share your email content with any party other than Google, as described above, and we do not use your email content for advertising.

## 4. What we store

Inbox Buddy does not currently maintain a database of your email content. Message data is retrieved from Gmail, processed in server memory for the duration of a single request, and discarded — it is not written to disk or retained by us after your summary or spam list is generated.

We do retain, for the duration of your signed-in session:

- Your Google account identifier, name, and email address (for display and authentication)
- Your Google OAuth access token (used to make Gmail API calls on your behalf), stored in an encrypted session cookie
- The fact that you agreed to this Privacy Policy and our Terms of Service, and the version and date you agreed

**[ENGINEERING TO CONFIRM]:** we do not currently keep a durable log of Delete or Unsubscribe actions (who did what, to which message, when) beyond standard hosting-platform request logs. We intend to add a persisted audit log for these actions.

## 5. Data retention

Because we do not independently store your email content, its retention is governed by Gmail's own retention policies, including Gmail's Trash retention period after you delete a message through Inbox Buddy. Your session data (Section 4) is retained only for the life of your signed-in session. **[ENGINEERING TO CONFIRM]** current session lifetime once token refresh is implemented.

## 6. Your choices and rights

You can disconnect Inbox Buddy at any time from your [Google Account permissions page](https://myaccount.google.com/permissions) — this immediately invalidates our access token and stops all access to your mailbox.

To ask a question, request information about what we've processed, or raise a concern, contact us at **[PRIVACY CONTACT EMAIL]**. **[ATTORNEY TO CONFIRM]** whether specific response-timeline commitments should be added here, depending on which jurisdictions' privacy laws apply.

## 7. Children's privacy

Inbox Buddy is not directed to, and is not knowingly used by, children under 18.

## 8. Security

We use industry-standard practices including encrypted connections (HTTPS), OAuth-based authentication, and encrypted session storage. **[ATTORNEY / ENGINEERING TO CONFIRM]:** a dedicated security audit of this Service has not yet been completed as of the date of this policy. This section should be revisited once one has been.

## 9. Third-party services

Your use of Inbox Buddy also involves Google's Gmail API and Gemini API, each governed by Google's own terms and privacy policy:

- Google Privacy Policy: https://policies.google.com/privacy
- Google API Services User Data Policy: https://developers.google.com/terms/api-services-user-data-policy

Inbox Buddy's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.

## 10. International data transfers

**[ATTORNEY TO CONFIRM]:** Inbox Buddy is hosted on Vercel, and Google's infrastructure may process data outside your country of residence. Add specific transfer-mechanism language once hosting region and customer jurisdictions are confirmed.

## 11. Changes to this policy

We may update this Privacy Policy from time to time. If we make a material change, we will update the "Last updated" date above and, where required, ask you to re-agree before continuing to use the Service.

## 12. Contact us

Questions about this policy can be sent to **[PRIVACY CONTACT EMAIL]**.
`.trim();

export const TERMS_OF_SERVICE = `
**Last updated:** ${LEGAL_LAST_UPDATED}

> **Note to reviewing attorney:** items marked **[ATTORNEY TO CONFIRM]** are open decisions that need to be made before this is published as final. Everything else is a complete first draft.

These Terms of Service ("Terms") govern your access to and use of Inbox Buddy (the "Service"), provided by **[LEGAL ENTITY NAME]** ("Company," "we," "us"). By connecting your Gmail account and using the Service, you agree to these Terms and to our Privacy Policy. If you do not agree, do not use the Service.

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

Inbox Buddy is a productivity tool. It does not provide legal, medical, financial, or other professional advice, and nothing it generates should be treated as such. **[ATTORNEY TO CONFIRM]** additional language here if the Service will specifically be marketed to regulated professionals such as law firms.

## 8. Disclaimer of warranties

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, OR THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE. **[ATTORNEY TO CONFIRM]** enforceability and any required consumer-protection carve-outs in the relevant jurisdiction(s).

## 9. Limitation of liability

TO THE FULLEST EXTENT PERMITTED BY LAW, **[LEGAL ENTITY NAME]** WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA, REVENUE, OR PROFITS, ARISING FROM YOUR USE OF THE SERVICE. **[ATTORNEY TO CONFIRM]** liability cap amount (e.g., fees paid in the preceding 12 months, or a fixed amount), and whether this clause is appropriate given the sensitivity of data this Service may process for a professional-services customer.

## 10. Indemnification

**[ATTORNEY TO CONFIRM]** whether a mutual or one-directional indemnification clause is appropriate here, and its scope.

## 11. Termination

You may stop using the Service at any time by revoking Google's access. We may suspend or terminate the Service, or your access to it, at any time, including for violation of these Terms or Section 5 (Acceptable Use).

## 12. Changes to these Terms

We may update these Terms from time to time. If we make a material change, we will update the "Last updated" date above and, where required, ask you to re-agree before continuing to use the Service.

## 13. Governing law and disputes

**[ATTORNEY TO CONFIRM]** governing law (Arizona is the Company's home jurisdiction), venue, and whether an arbitration clause and/or class-action waiver should be included.

## 14. Contact us

Questions about these Terms can be sent to **[LEGAL / SUPPORT CONTACT EMAIL]**.
`.trim();
