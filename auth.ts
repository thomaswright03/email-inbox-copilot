import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { refreshGoogleAccessToken } from "@/lib/google-auth";

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    // The Google access token itself is kept fresh independently (see the
    // jwt callback below), so the session cookie no longer needs to be
    // pinned to that token's own ~1 hour lifetime. maxAge is now a plain
    // idle-timeout ceiling; updateAge rolls it forward on every active
    // request, so a user who keeps using the app in a day never gets
    // signed out, while a genuinely abandoned session still expires.
    maxAge: 60 * 60 * 24 * 30,
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
    async jwt({ token, account, trigger, session }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = account.expires_at;
      }
      if (trigger === "update" && session?.legalVersionAccepted) {
        token.legalVersionAccepted = session.legalVersionAccepted as string;
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
        console.error("Failed to refresh Google access token:", err);
        return { ...token, error: "RefreshAccessTokenError" };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.error = token.error as string | undefined;
      session.legalVersionAccepted = token.legalVersionAccepted as string | undefined;
      session.legalAcceptedAt = token.legalAcceptedAt as number | undefined;
      return session;
    },
  },
});
