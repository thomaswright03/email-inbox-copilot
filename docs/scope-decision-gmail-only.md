# Scope Decision — Gmail-Only, Browser-Based (Pending Confirmation)

**Product:** Inbox Buddy (`email-inbox-copilot`)
**Date:** 2026-09-23
**Status:** DRAFT — needs Thomas's explicit confirmation before this counts as a settled decision

## The gap

The original project brief said the solution "should work on Windows, PC, and Mac email
clients." What's built and deployed is a Gmail-only web app, reachable from any browser on
any OS, with no integration into any actual email client (Outlook, Apple Mail,
Thunderbird) and no native packaging (the original spec's Phase 4, Electron/Tauri, was
dropped).

Read one way ("runs in a browser on any OS"), the requirement is met. Read the other way
("integrates with the mail clients people already have"), it isn't. Nothing in the repo
formally records which reading was intended, or that a stakeholder ever signed off on the
narrower one — the only place this is mentioned is a bullet in the README's "current
scope" notes, which an external reviewer flagged as insufficient for a decision this
consequential (a real capability gap, not a bug).

## Options

**A — Formalize the Gmail-only descope.** Keep the current architecture. This document
becomes the record that the narrower interpretation was a deliberate, reviewed choice, not
an oversight. Cost: none beyond confirming it in writing. Risk: any future partner who
specifically needs Outlook/IMAP/desktop-client support can't use the product as-is.

**B — Build a second connector.** Add Outlook (Microsoft Graph API) and/or generic IMAP
support behind the same interface `lib/gmail.ts` already establishes. This is a real
feature, not a quick fix — it needs a new Azure AD app registration (a business decision
and setup step, the same category of work as the original Google Cloud Console setup),
new OAuth consent flows, and testing against a second provider's quirks. Effort: Large.

## Recommendation

Option A, for now. The product's actual current audience ("any of my business partners
who wants to use it") hasn't surfaced a concrete need for Outlook/IMAP yet, and building
that speculatively before anyone's asked for it would be scope creep in the other
direction. If a specific partner does need it, that's a clear, concrete trigger to revisit
Option B rather than guessing at the requirement now.

## What still needs to happen

This file existing is not itself the decision — it's the record, once Thomas confirms
which option to take. Until confirmed, treat the scope as still open, not settled.
