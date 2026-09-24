import "next-auth";

declare module "next-auth" {
  interface Session {
    error?: string;
    legalVersionAccepted?: string;
    legalAcceptedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    googleId?: string;
    sessionVersion?: number;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
    legalVersionAccepted?: string;
    legalAcceptedAt?: number;
  }
}
