import { raiseAlert } from "./alert";

// Server-side logging helpers that never write secrets to logs.
//
// googleapis/gaxios errors carry the full request config, including the
// `Authorization: Bearer <access token>` header, and fetch errors can carry
// URLs with tokens in the query string. Passing those error objects straight
// to console.error would copy live OAuth credentials into the host's log
// store. Everything here reduces an error to a small, known-safe shape first.

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /ya29\.[A-Za-z0-9._-]+/g, // Google OAuth access tokens
  /1\/\/[A-Za-z0-9._-]{20,}/g, // Google OAuth refresh tokens
  /AIza[0-9A-Za-z_-]{20,}/g, // Google API keys (Gemini)
  /([?&](?:access_token|refresh_token|token|key|code|client_secret)=)[^&\s]+/gi,
  /postgres(?:ql)?:\/\/[^\s]+/gi,
];

export function redact(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) =>
      typeof prefix === "string" && match.startsWith(prefix) ? `${prefix}[REDACTED]` : "[REDACTED]"
    );
  }
  return out.slice(0, 500);
}

export type SafeError = { name: string; message: string; status?: number; code?: string };

export function toSafeError(err: unknown): SafeError {
  if (err instanceof Error) {
    const e = err as Error & { status?: unknown; code?: unknown; response?: { status?: unknown } };
    const status =
      typeof e.status === "number" ? e.status : typeof e.response?.status === "number" ? e.response.status : undefined;
    const code = typeof e.code === "string" || typeof e.code === "number" ? String(e.code) : undefined;
    return { name: e.name, message: redact(e.message ?? ""), ...(status ? { status } : {}), ...(code ? { code } : {}) };
  }
  return { name: "NonError", message: redact(String(err)) };
}

export function logError(context: string, err: unknown): void {
  console.error(JSON.stringify({ level: "error", context, error: toSafeError(err) }));
}

// Events that page an operator (lib/alert.ts), not just log.
const ALERT_EVENTS = new Set(["rate_limited", "ssrf_blocked", "cross_site_request_blocked", "session_rejected", "ai_quota_exhausted"]);

// Security-relevant events (rate-limit hits, blocked SSRF attempts, rejected
// cross-site requests, invalid input) go out as one structured line each, so
// they can be alerted on from the host's log drain.
export function logSecurityEvent(event: string, fields: Record<string, string | number | boolean | undefined> = {}): void {
  const safeFields: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    safeFields[k] = typeof v === "string" ? redact(v) : v;
  }
  console.warn(JSON.stringify({ level: "security", event, ...safeFields }));
  if (ALERT_EVENTS.has(event)) {
    void raiseAlert(event, `Security event: ${event}`, safeFields as Record<string, string | number>);
  }
}

// Gemini (and Google APIs generally) report exhausted quota as HTTP 429 /
// RESOURCE_EXHAUSTED.
export function isQuotaError(err: unknown): boolean {
  const safe = toSafeError(err);
  return safe.status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(safe.message);
}
