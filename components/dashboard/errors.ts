import type { MessageKey } from "@/lib/i18n";

// API error codes (lib/api.ts ErrorCode, plus the client's own "network"
// and "bad_response") that have a specific message; everything else falls
// back to the context's generic message.
const SPECIFIC: Record<string, MessageKey> = {
  network: "errors.network",
  timeout: "errors.timeout",
  gmail_reconnect: "errors.gmail_reconnect",
  gmail_unavailable: "errors.gmail_unavailable",
  message_gone: "errors.message_gone",
  rate_limited: "errors.rate_limited",
  unauthenticated: "errors.unauthenticated",
  consent_required: "errors.consent_required",
  no_unsubscribe: "errors.no_unsubscribe",
  unsubscribe_unsafe: "errors.unsubscribe_unsafe",
  unsubscribe_rejected: "errors.unsubscribe_rejected",
  unsubscribe_failed: "errors.unsubscribe_failed",
};

export function errorMessageKey(code: string, fallback: MessageKey): MessageKey {
  return SPECIFIC[code] ?? fallback;
}
