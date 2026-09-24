import { NextResponse } from "next/server";
import { getGoogleSession, type GoogleSession } from "./session";
import { RateLimitError } from "./rate-limit";
import { logSecurityEvent } from "./log";

// Every error response carries a stable `code` (the dashboard shows a
// translated message for it) and an English `error` sentence as a fallback.
export type ErrorCode =
  | "unauthenticated"
  | "consent_required"
  | "cross_site"
  | "invalid_request"
  | "rate_limited"
  | "gmail_reconnect"
  | "gmail_unavailable"
  | "action_failed"
  | "no_unsubscribe"
  | "unsubscribe_unsafe"
  | "unsubscribe_rejected"
  | "unsubscribe_failed"
  | "server_error";

const DEFAULT_CODE: Record<number, ErrorCode> = {
  400: "invalid_request",
  401: "unauthenticated",
  403: "consent_required",
  413: "invalid_request",
  415: "invalid_request",
  429: "rate_limited",
  502: "action_failed",
};

export function jsonError(error: string, status: number, headers?: HeadersInit, code?: ErrorCode): NextResponse {
  return NextResponse.json(
    { ok: false, code: code ?? DEFAULT_CODE[status] ?? "server_error", error },
    { status, headers }
  );
}

export function rateLimitedResponse(err: RateLimitError): NextResponse {
  return jsonError("You're doing that too often. Try again shortly.", 429, {
    "Retry-After": String(err.retryAfterSeconds),
  });
}

// Every API route starts here. Returns the server-side session, or the
// response to send instead: 401 when not signed in, 403 when the user
// hasn't accepted the current Terms/Privacy version (no inbox data is read,
// sent to Gemini, or modified before that).
export async function requireSession(req: Request): Promise<GoogleSession | NextResponse> {
  const session = await getGoogleSession(req.headers);
  if (!session) return jsonError("Not authenticated", 401);
  if (!session.consented) return jsonError("Please accept the Terms and Privacy Policy first", 403);
  return session;
}

// CSRF defence for state-changing requests, on top of the SameSite=Lax
// session cookie: the request must come from this app's own origin.
export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("host") ?? new URL(req.url).host;
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return false;
    }
    return originHost === host;
  }
  // No Origin header: only accept what the browser itself labels same-origin.
  return req.headers.get("sec-fetch-site") === "same-origin";
}

export function rejectCrossSite(req: Request, route: string): NextResponse | null {
  if (isSameOriginRequest(req)) return null;
  logSecurityEvent("cross_site_request_blocked", { route });
  return jsonError("Cross-site request blocked", 403, undefined, "cross_site");
}

// Reads the body but stops (and cancels the stream) as soon as it exceeds
// `limit` bytes, so a chunked body without Content-Length is never buffered
// beyond the cap. Returns null when the body is too large.
export async function readBodyCapped(req: Request, limit: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
