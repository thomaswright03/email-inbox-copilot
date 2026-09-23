import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: {
    strategy: "jwt",
    // Matches the Google access token's ~1 hour lifetime (see Privacy Policy
    // Section 5) — without this, the session cookie would outlive the token
    // it depends on by NextAuth's 30-day default.
    maxAge: 60 * 60,
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
      return token;
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
