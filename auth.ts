import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { refreshGoogleAccessToken } from "@/lib/google-auth";
import { SESSION_COOKIE_NAME, USE_SECURE_COOKIES } from "@/lib/session-cookie";
import { LEGAL_VERSION } from "@/content/legal";
import { logError, logSecurityEvent } from "@/lib/log";
import { purgeUserCaches } from "@/lib/response-cache";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

// Refresh the Google access token this many seconds before it actually
// expires, so a request never races an about-to-expire token.
const REFRESH_MARGIN_SECONDS = 5 * 60;

// Optional sign-in allowlist: a comma-separated list of email addresses
// and/or "@domain" entries. When set, nobody else can sign in (and so
// nobody else can spend this deployment's Gmail/Gemini quota).
export function isEmailAllowed(email: string, allowlist = process.env.ALLOWED_EMAILS): boolean {
  if (!allowlist || !allowlist.trim()) return true;
  const normalized = email.trim().toLowerCase();
  return allowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => (entry.startsWith("@") ? normalized.endsWith(entry) : normalized === entry));
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  useSecureCookies: USE_SECURE_COOKIES,
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: USE_SECURE_COOKIES },
    },
  },
  session: {
    strategy: "jwt",
    // The session cookie carries a Gmail-modify refresh token, so it is
    // bounded: it expires after 7 days without use. updateAge rolls it
    // forward on activity so an active user isn't signed out mid-week.
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60,
  },
  providers: [
    Google({
      authorization: {
        params: {
          scope: GMAIL_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;
      const email = typeof profile?.email === "string" ? profile.email : "";
      if (!email || profile?.email_verified !== true) {
        logSecurityEvent("signin_rejected", { reason: "unverified_email" });
        return false;
      }
      if (!isEmailAllowed(email)) {
        logSecurityEvent("signin_rejected", { reason: "not_allowlisted" });
        return false;
      }
      return true;
    },
    async jwt({ token, account, trigger, session }) {
      if (account) {
        token.googleId = account.providerAccountId;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      // The client can only record acceptance of the current legal version;
      // any other value sent through session.update() is ignored.
      if (trigger === "update" && session?.legalVersionAccepted === LEGAL_VERSION) {
        token.legalVersionAccepted = LEGAL_VERSION;
        token.legalAcceptedAt = Date.now();
      }

      const expiresAtSeconds = (token.expiresAt as number | undefined) ?? 0;
      const stillFresh = Date.now() / 1000 < expiresAtSeconds - REFRESH_MARGIN_SECONDS;
      if (stillFresh) return token;

      const refreshToken = token.refreshToken as string | undefined;
      if (!refreshToken) {
        return { ...token, error: "RefreshAccessTokenError" };
      }
      try {
        const refreshed = await refreshGoogleAccessToken(refreshToken);
        return {
          ...token,
          accessToken: refreshed.accessToken,
          expiresAt: refreshed.expiresAt,
          refreshToken: refreshed.refreshToken,
          error: undefined,
        };
      } catch (err) {
        logError("auth.refresh", err);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    // This object is what /api/auth/session returns to browser JavaScript.
    // It deliberately carries no Google access or refresh token: server code
    // reads those from the encrypted cookie via lib/session.ts.
    async session({ session, token }) {
      session.error = token.error as string | undefined;
      session.legalVersionAccepted = token.legalVersionAccepted as string | undefined;
      session.legalAcceptedAt = token.legalAcceptedAt as number | undefined;
      return session;
    },
  },
  events: {
    // Signing out removes this user's cached inbox summaries and spam
    // verdicts from every cache layer, not just the cookie.
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      const googleId = typeof token?.googleId === "string" ? token.googleId : null;
      if (googleId) await purgeUserCaches(googleId);
    },
  },
});
