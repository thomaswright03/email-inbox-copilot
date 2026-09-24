// English interface text. es.ts and fr.ts must define every key (the type
// checker enforces it). "{name}" is a placeholder; keys ending in _one /
// _other are plural forms chosen by the count.
export const en = {
  "app.name": "Inbox Buddy",
  "app.description": "Daily email summary and spam flashcards",

  "prefs.language": "Language",
  "prefs.legalEnglishOnly": "The Terms and Privacy Policy are available in English only.",
  "prefs.theme": "Theme",
  "prefs.theme.light": "Light",
  "prefs.theme.dark": "Dark",
  "prefs.theme.system": "System",

  "signin.tagline":
    "Connect Gmail for a daily summary of your recent mail, and a spam tab that helps flag promotional messages your junk folder may have missed.",
  "signin.continue": "Continue with Google",
  "signin.agreePrefix": "By continuing, you agree to our",
  "signin.and": "and",
  "legal.terms": "Terms of Service",
  "legal.privacy": "Privacy Policy",
  "legal.back": "Back to Inbox Buddy",
  "legal.englishOnly": "This document is available in English only.",

  "consent.title": "Before you continue",
  "consent.ai":
    "When AI features are on, the sender, subject, and a short preview of your recent emails are sent to Google's Gemini API (paid tier, which Google doesn't use to improve its products) to write your summary and flag spam. When they are off, nothing is sent to Gemini.",
  "consent.accuracy":
    "Summaries and spam flags can be incomplete or wrong. Always check your inbox directly for anything time-sensitive or important.",
  "consent.actions":
    "Delete moves a message to Trash. Unsubscribe contacts the sender and archives the message. Both act on your Gmail account immediately.",
  "consent.scope": "Don't connect a mailbox holding privileged legal, medical, or financial-account correspondence.",
  "consent.checkboxPrefix": "I am 18 or older, and I have read and agree to the",
  "consent.agree": "Agree & Continue",
  "consent.continuing": "Continuing…",
  "consent.signOut": "Not now, sign out instead",
  "consent.saveFailed": "We couldn't save your agreement. Please try again in a moment.",
  "consent.notSetUp":
    "Inbox Buddy isn't fully set up yet, so it can't record your agreement. Please contact {email} and try again later.",

  "auth.title.AccessDenied": "This Google account can't use Inbox Buddy",
  "auth.body.AccessDenied":
    "Inbox Buddy is invite-only, and this Google account isn't on the list (or its email address isn't verified with Google). If you were invited, sign in with the Google account you gave us.",
  "auth.title.Verification": "That sign-in link has expired",
  "auth.body.Verification": "The sign-in request is no longer valid. Start again to get a fresh one.",
  "auth.title.Configuration": "Sign-in isn't working right now",
  "auth.body.Configuration":
    "Inbox Buddy couldn't complete the sign-in because of a problem on our side. Please try again later.",
  "auth.title.default": "Sign-in didn't work",
  "auth.body.default": "Something went wrong while signing you in with Google. Please try again.",
  "auth.contact": "Questions? Contact {email}.",
  "auth.tryDifferent": "Try a different Google account",
  "auth.tryAgain": "Try again",

  "header.signOut": "Sign out",

  "tabs.label": "Inbox views",
  "tabs.summary": "Today's Summary",
  "tabs.spam": "Spam Flashcards",
  "tabs.spamCount_one": "{count} suspected spam email",
  "tabs.spamCount_other": "{count} suspected spam emails",

  "summary.count_one": "{count} message in the last 24 hours",
  "summary.count_other": "{count} messages in the last 24 hours",
  "summary.truncated": "Showing the newest {shown} of about {total} messages from the last 24 hours",
  "summary.updated": "Updated {time}",
  "summary.refresh": "Refresh",
  "summary.refreshing": "Refreshing…",
  "summary.empty": "No messages in the last 24 hours.",
  "summary.ai.generated": "AI-generated summary. It can miss or misstate things, so check your inbox for anything important.",
  "summary.ai.off": "Simple rule-based list (AI summaries are off). Check your inbox for anything important.",
  "summary.ai.unavailable":
    "The AI summary isn't available right now, so this is a simple rule-based list. Check your inbox for anything important.",
  "summary.group.toCheck": "Messages to check ({count})",
  "summary.group.bulk": "Likely promotional or bulk ({count})",
  "summary.allMessages": "All messages ({count})",
  "summary.openInGmail": "Open in Gmail",
  "summary.openInGmailAria": "Open “{subject}” in Gmail",

  "spam.ai.generated": "Flagged by AI. These are suggestions and can be wrong, so check each one before you act.",
  "spam.ai.off": "Flagged by simple rules (AI is off). These are suggestions and can be wrong, so check each one before you act.",
  "spam.ai.unavailable":
    "AI spam checks aren't available right now, so these were flagged by simple rules. Check each one before you act.",
  "spam.empty": "No suspected spam in your inbox from the last 24 hours.",
  "spam.reason.marketing": "Looks like marketing or a promotion",
  "spam.reason.newsletter": "Looks like a newsletter or bulk mailing",
  "spam.reason.cold_outreach": "Looks like unsolicited cold outreach",
  "spam.reason.phishing_pattern": "Has patterns common in phishing",
  "spam.reason.legitimate": "Looks legitimate",
  "spam.delete": "Delete",
  "spam.unsubscribe": "Unsubscribe",
  "spam.unsubscribeHint": "Asks the sender to unsubscribe you, then archives this message",
  "spam.openUnsubscribePage": "Open unsubscribe page",
  "spam.openUnsubscribePageHint": "Opens the sender's own unsubscribe page in a new tab; you may need to confirm there",
  "spam.emailToUnsubscribe": "Email to unsubscribe",
  "spam.emailToUnsubscribeHint": "Opens a prefilled unsubscribe email in Gmail for you to send",
  "spam.finishOnSenderPage": "Finish unsubscribing on the sender's page, then delete this message or mark it not spam.",
  "spam.finishInGmail": "Send the prefilled email in Gmail to finish unsubscribing, then delete this message or mark it not spam.",
  "spam.noUnsubscribe": "This sender doesn't offer an unsubscribe option.",
  "spam.notSpam": "Not spam",
  "spam.notSpamHint": "Stop flagging this message",
  "spam.working": "Working…",
  "spam.openInGmail": "Open in Gmail",

  "confirm.title": "Delete this email?",
  "confirm.body": "From {name}: “{subject}”. This moves it to Gmail Trash, and you can undo it for a few seconds.",
  "confirm.cancel": "Cancel",
  "confirm.delete": "Delete",

  "toast.deleted": "Moved “{subject}” to Trash.",
  "toast.unsubscribed": "Unsubscribed from {name} and archived the message.",
  "toast.unsubscribedNotArchived": "Unsubscribed from {name}, but couldn't archive the message. It's still in your inbox.",
  "toast.notSpam": "Marked “{subject}” as not spam. It won't be flagged again.",
  "toast.undone": "Undone.",
  "toast.undoFailed": "Couldn't undo that. Check the message in Gmail.",
  "toast.undo": "Undo",
  "toast.dismiss": "Dismiss",

  "errors.summaryLoad": "Inbox Buddy couldn't load your summary. Try again in a moment.",
  "errors.spamLoad": "Inbox Buddy couldn't check for spam. Try again in a moment.",
  "errors.action": "That didn't work. Try again in a moment.",
  "errors.network": "Couldn't reach Inbox Buddy. Check your connection and try again.",
  "errors.gmail_reconnect": "Inbox Buddy has lost access to your Gmail. Reconnect to continue.",
  "errors.gmail_unavailable": "Couldn't reach Gmail right now. Try again in a moment.",
  "errors.rate_limited": "You're doing that too often. Try again shortly.",
  "errors.unauthenticated": "Your session has ended. Sign in again to continue.",
  "errors.consent_required": "Please accept the Terms and Privacy Policy first.",
  "errors.no_unsubscribe": "This sender doesn't support one-click unsubscribe.",
  "errors.unsubscribe_unsafe": "This sender's unsubscribe link isn't allowed.",
  "errors.unsubscribe_rejected": "The sender didn't accept the unsubscribe request. You are still subscribed.",
  "errors.unsubscribe_failed": "Couldn't reach the sender to unsubscribe. You are still subscribed. Try again later.",
  "errors.retry": "Try again",
  "errors.reconnect": "Reconnect Gmail",

  "footer.yourData": "Your data",
  "footer.accountId": "Account id",
  "footer.dataIntro": "Email us from this account's address to",
  "footer.requestCopy": "request a copy",
  "footer.or": "or",
  "footer.requestDeletion": "request deletion",
  "footer.dataOutro": "; the link fills in a code that shows the request is yours.",

  "notFound.title": "Page not found",
  "notFound.body": "The page you're looking for doesn't exist or may have moved.",
  "error.title": "Something went wrong",
  "error.body": "An unexpected error occurred. You can try again, or head back to the dashboard.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = { readonly [K in MessageKey]: string };
