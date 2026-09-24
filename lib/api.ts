import { NextResponse } from "next/server";
import { getGoogleSession, type GoogleSession } from "./session";
import { RateLimitError } from "./rate-limit";
import { logSecurityEvent } from "./log";

export function jsonError(error: string, status: number, headers?: HeadersInit): NextResponse {
  return NextResponse.json({ ok: false, error }, { status, headers });
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
  return jsonError("Cross-site request blocked", 403);
}
