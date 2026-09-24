import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { SESSION_COOKIE_NAME, USE_SECURE_COOKIES } from "@/lib/session-cookie";

// API routes are authenticated by default: any /api/* request other than
// Auth.js's own /api/auth/* endpoints is refused here unless it carries a
// valid (decryptable, unexpired) session cookie. Each route still performs
// the full check (session version, consent) through lib/api.ts, so a new
// route that forgets to is still not public.
async function requireApiSession(request: NextRequest): Promise<NextResponse | null> {
  const secret = process.env.AUTH_SECRET;
  const token = secret
    ? await getToken({
        req: request,
        secret,
        secureCookie: USE_SECURE_COOKIES,
        cookieName: SESSION_COOKIE_NAME,
        salt: SESSION_COOKIE_NAME,
      })
    : null;
  if (token && !token.error && typeof token.googleId === "string") return null;
  return NextResponse.json(
    { ok: false, error: "Not authenticated" },
    { status: 401, headers: { "Cache-Control": "no-store" } }
  );
}

// Per-request nonce-based Content Security Policy for every page. Next.js
// reads the nonce from the request's CSP header and stamps it onto its own
// scripts, so no inline script or style without the nonce can run, and the
// app can't be framed. API responses get a static deny-all CSP from
// next.config.ts instead.
export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (pathname.startsWith("/api/auth/")) return NextResponse.next();
    return (await requireApiSession(request)) ?? NextResponse.next();
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/api/:path*",
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
