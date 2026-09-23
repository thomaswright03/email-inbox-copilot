# Risk Acceptance Memo — Gemini Free-Tier AI Processing

**Product:** Inbox Buddy (`email-inbox-copilot`)
**Operating entity:** Wright AI Solutions LLC
**Date:** 2026-09-23
**Prepared by:** Thomas Wright
**Status:** ACCEPTED, pending signature below

## 1. The risk being accepted

Inbox Buddy sends the sender, subject line, and short preview snippet of each processed
email to Google's Gemini API for AI summarization and spam classification. As of this
memo's date, this integration uses Gemini's standard, no-cost API tier.

Under Google's published terms for that tier, Google may use content submitted through it
to improve its own products. This differs from Google's paid tiers, which carry a
contractual no-training commitment. Wright AI Solutions LLC has not entered into a
separate Data Processing Agreement (DPA) with Google covering this use.

This means: sender, subject, and snippet data from any connected mailbox — including
personal data belonging to third parties (the senders of that mail, who are not users of
this product and have not agreed to anything) — passes through a vendor pipeline with no
contractual assurance against retention or reuse beyond the underlying processing itself.

## 2. Why this is being accepted rather than fixed now

Inbox Buddy's customer base, as of this memo, is general small-business partners of Wright
AI Solutions LLC — not a confirmed regulated-professional customer (law, health, financial
services) with confirmed confidentiality or privilege obligations attaching to their
mailbox content. Moving to a paid, no-training Gemini tier ahead of any such customer
being onboarded would add an ongoing operating cost with no corresponding reduction in
risk for the product's actual current use.

This is a deliberate sequencing decision, not an oversight: the underlying gap is real,
tracked, and its resolution is scoped to a specific, concrete trigger rather than an
indefinite deferral.

## 3. Scope of acceptance

This acceptance covers general small-business use of Inbox Buddy where no connected
mailbox is known or reasonably suspected to carry legally privileged, medical, financial-
account, or otherwise professionally-confidential correspondence as a routine matter of
the account holder's business.

This acceptance does **not** extend to any account or partner where that condition is not
met. The Privacy Policy (`content/legal.ts`, Section 3) already discloses this risk
directly to every user and states they should not rely on the Service for confidential or
privileged email until this changes.

## 4. Trigger for revisiting this decision

This risk acceptance must be revisited, and this memo reissued or revoked, upon any of the
following:

- Onboarding, or receiving a request to onboard, any partner who indicates their mailbox
  routinely handles legally privileged, medical, or financial-account information (e.g., a
  law firm, healthcare provider, financial advisor, or accountant).
- A material change to Gemini's free-tier terms of service regarding data use or retention.
- A decision to actively market or sell Inbox Buddy to regulated-industry customers.
- Any indication that a specific connected mailbox is, in practice, processing the kind of
  sensitive correspondence described above, regardless of the account holder's stated
  business type.

Upon any of the above, this acceptance no longer applies and the product should move to a
paid, no-training Gemini tier with a signed DPA — or the affected account should be
excluded from AI processing — before continuing to process that mailbox's content.

## 5. Acceptance

By signing below, I confirm I have the authority to accept this risk on behalf of Wright AI
Solutions LLC, and that I accept it on the terms and scope described above.

Signature: _______________________________
Name: Thomas Wright
Title: _______________________________
Date: _______________________________
