import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { refreshGoogleAccessToken, revokeGoogleToken } from "@/lib/google-auth";
import { currentSessionVersion, revokeUserSessions } from "@/lib/session-store";
import { logAuditEvent } from "@/lib/audit";
import { SESSION_COOKIE_NAME, USE_SECURE_COOKIES } from "@/lib/session-cookie";
import { LEGAL_VERSION } from "@/content/legal";
import { logError, logSecurityEvent } from "@/lib/log";
import { purgeUserCaches } from "@/lib/response-cache";
import { recordConsent } from "@/lib/consent";

// gmail.modify is the narrowest scope that allows trashing and archiving
// (and it includes the metadata reads the app does); gmail.readonly would
// add nothing but full-body read rights, so it isn't requested.
const GMAIL_SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.modify"].join(" ");

// Refresh the Google access token this many seconds before it actually
// expires, so a request never races an about-to-expire token.
const REFRESH_MARGIN_SECONDS = 5 * 60;

// Sign-in allowlist: a comma-separated list of email addresses and/or
// "@domain" entries. When set, nobody else can sign in (and so nobody else
// can spend this deployment's Gmail/Gemini quota). In production an empty
// allowlist lets nobody in: the service is offered only to the people the
// operator has named (Terms, "Who can use Inbox Buddy"), so a deployment
// that forgets to set it fails closed instead of opening to the public.
export function isEmailAllowed(
  email: string,
  allowlist = process.env.ALLOWED_EMAILS,
  production = process.env.NODE_ENV === "production"
): boolean {
  if (!allowlist || !allowlist.trim()) return !production;
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
  // Failed sign-ins (not on the allowlist, unverified email, provider or
  // configuration errors) land on the app's own page instead of Auth.js's
  // unstyled default, which the CSP also breaks.
  pages: { signIn: "/", error: "/auth/error" },
  session: {
    strategy: "jwt",
    // The session cookie carries a Gmail-modify refresh token, so it is
    // short-lived: it expires after 12 hours without use (updateAge rolls it
    // forward while the user is active). Sign-out also revokes the Google
    // token and every server-side session generation (events.signOut).
    maxAge: 60 * 60 * 12,
    updateAge: 60 * 15,
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
      const userId = account.providerAccountId;
      const email = typeof profile?.email === "string" ? profile.email : "";
      if (!email || profile?.email_verified !== true) {
        logSecurityEvent("signin_rejected", { user: userId, reason: "unverified_email" });
        await logAuditEvent({ userId, action: "sign_in_rejected", detail: "unverified email" });
        return false;
      }
      if (!isEmailAllowed(email)) {
        logSecurityEvent("signin_rejected", { user: userId, reason: "not_allowlisted" });
        await logAuditEvent({ userId, action: "sign_in_rejected", detail: "not on allowlist" });
        return false;
      }
      logSecurityEvent("signin", { user: userId });
      return true;
    },
    async jwt({ token, account, trigger, session }) {
      if (account) {
        token.googleId = account.providerAccountId;
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
        try {
          token.sessionVersion = (await currentSessionVersion(account.providerAccountId)) ?? undefined;
        } catch (err) {
          // Without a recorded version the session is rejected by
          // lib/session.ts, i.e. sign-in fails closed.
          logError("auth.session-version", err);
          token.sessionVersion = undefined;
        }
        await logAuditEvent({ userId: account.providerAccountId, action: "sign_in" });
      }
      // The client can only record acceptance of the current legal version;
      // any other value sent through session.update() is ignored.
      // The acceptance is applied only once a durable record of it exists
      // (lib/consent.ts); if the write fails the user stays on the consent
      // screen and can try again.
      if (trigger === "update" && session?.legalVersionAccepted === LEGAL_VERSION && token.googleId) {
        if (await recordConsent(token.googleId as string, LEGAL_VERSION)) {
          token.legalVersionAccepted = LEGAL_VERSION;
          token.legalAcceptedAt = Date.now();
          await logAuditEvent({ userId: token.googleId as string, action: "consent_accepted", detail: LEGAL_VERSION });
        }
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
        await logAuditEvent({ userId: token.googleId ?? "(unknown)", action: "token_refresh_failed" });
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
    // Signing out ends the session everywhere, not just in this browser:
    // the Google refresh token is revoked (so a copied cookie can no longer
    // reach Gmail), the user's server-side session generation is bumped (so
    // any copied cookie is rejected by lib/session.ts), and their cached
    // inbox summaries and spam verdicts are deleted from every cache layer.
    async signOut(message) {
      const token = "token" in message ? message.token : null;
      if (!token) return;
      const googleId = typeof token.googleId === "string" ? token.googleId : null;
      const refreshToken = typeof token.refreshToken === "string" ? token.refreshToken : null;
      await Promise.all([
        refreshToken
          ? revokeGoogleToken(refreshToken).catch((err) => {
              logError("auth.revoke", err);
              return false;
            })
          : Promise.resolve(false),
        googleId ? revokeUserSessions(googleId) : Promise.resolve(),
        googleId ? purgeUserCaches(googleId) : Promise.resolve(),
      ]);
      logSecurityEvent("signout", { user: googleId ?? "(unknown)" });
      await logAuditEvent({ userId: googleId ?? "(unknown)", action: "sign_out" });
    },
  },
});
