import { headers as nextHeaders } from "next/headers";
import { getToken } from "next-auth/jwt";
import { refreshGoogleAccessToken } from "./google-auth";
import { SESSION_COOKIE_NAME, USE_SECURE_COOKIES } from "./session-cookie";
import { LEGAL_VERSION } from "@/content/legal";
import { logError, logSecurityEvent } from "./log";
import { checkSessionVersion } from "./session-store";

// Server-only view of the signed-in user. The Google access and refresh
// tokens live only inside the encrypted, HttpOnly session cookie and are
// read here on the server; they are never copied into the session object
// that /api/auth/session returns to browser JavaScript (see auth.ts).
export type GoogleSession = {
  // Stable Google account id. Every per-user key (cache, rate limit) uses
  // this, never the display email and never a shared fallback.
  userId: string;
  userEmail: string;
  userName: string | null;
  accessToken: string;
  consented: boolean;
};

const EXPIRY_MARGIN_SECONDS = 60;

export async function getGoogleSession(headers?: Headers): Promise<GoogleSession | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    // A running server without the secret can't read any session: that is
    // reported loudly. `next build` renders pages without runtime secrets,
    // so there it is expected and not an error.
    if (process.env.NEXT_PHASE !== "phase-production-build") logError("session", new Error("AUTH_SECRET is not set"));
    return null;
  }

  const token = await getToken({
    req: { headers: headers ?? (await nextHeaders()) },
    secret,
    secureCookie: USE_SECURE_COOKIES,
    cookieName: SESSION_COOKIE_NAME,
    salt: SESSION_COOKIE_NAME,
  });
  if (!token || token.error) return null;

  const userId = typeof token.googleId === "string" ? token.googleId : null;
  const userEmail = typeof token.email === "string" ? token.email : null;
  if (!userId || !userEmail) return null;

  // A cookie issued before the user's last sign-out or an operator
  // revocation carries an older version and is refused.
  const check = await checkSessionVersion(userId, token.sessionVersion);
  if (check !== "valid") {
    logSecurityEvent("session_rejected", { reason: check });
    return null;
  }

  let accessToken = typeof token.accessToken === "string" ? token.accessToken : null;
  const expiresAt = typeof token.expiresAt === "number" ? token.expiresAt : 0;
  if (!accessToken || Date.now() / 1000 >= expiresAt - EXPIRY_MARGIN_SECONDS) {
    // The jwt callback in auth.ts refreshes and persists the token whenever
    // the browser polls /api/auth/session; this covers a request that lands
    // in between, without writing anything back.
    const refreshToken = typeof token.refreshToken === "string" ? token.refreshToken : null;
    if (!refreshToken) return null;
    try {
      accessToken = (await refreshGoogleAccessToken(refreshToken)).accessToken;
    } catch (err) {
      logError("session.refresh", err);
      return null;
    }
  }

  return {
    userId,
    userEmail,
    userName: typeof token.name === "string" ? token.name : null,
    accessToken,
    consented: token.legalVersionAccepted === LEGAL_VERSION,
  };
}
