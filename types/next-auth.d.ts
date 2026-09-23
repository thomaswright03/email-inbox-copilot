import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: string;
    legalVersionAccepted?: string;
    legalAcceptedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
    legalVersionAccepted?: string;
    legalAcceptedAt?: number;
  }
}
