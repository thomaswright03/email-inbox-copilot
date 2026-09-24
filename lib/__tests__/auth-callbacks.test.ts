import { describe, it, expect, vi, beforeEach } from "vitest";

// auth.ts hands its configuration to NextAuth(); capture it and exercise the
// callbacks directly, with the Google, database and audit boundaries faked.
type Config = {
  pages: Record<string, string>;
  session: { maxAge: number };
  callbacks: {
    signIn: (args: unknown) => Promise<boolean>;
    jwt: (args: unknown) => Promise<Record<string, unknown>>;
    session: (args: unknown) => Promise<Record<string, unknown>>;
  };
  events: { signOut: (message: unknown) => Promise<void> };
};
const captured = vi.hoisted(() => ({}) as { config?: Config });
vi.mock("next-auth", () => ({
  default: (config: Config) => {
    captured.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({ default: (options: unknown) => ({ id: "google", options }) }));
vi.mock("@/lib/google-auth", () => ({ refreshGoogleAccessToken: vi.fn(), revokeGoogleToken: vi.fn() }));
vi.mock("@/lib/session-store", () => ({ currentSessionVersion: vi.fn(), revokeUserSessions: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/response-cache", () => ({ purgeUserCaches: vi.fn() }));
vi.mock("@/lib/consent", () => ({ recordConsent: vi.fn() }));

import "@/auth";
import { refreshGoogleAccessToken, revokeGoogleToken } from "@/lib/google-auth";
import { currentSessionVersion, revokeUserSessions } from "@/lib/session-store";
import { logAuditEvent } from "@/lib/audit";
import { purgeUserCaches } from "@/lib/response-cache";
import { recordConsent } from "@/lib/consent";
import { LEGAL_VERSION } from "@/content/legal";

const config = () => captured.config!;
const later = () => Math.floor(Date.now() / 1000) + 3600;
const account = { provider: "google", providerAccountId: "gid-1", access_token: "a1", refresh_token: "r1", expires_at: later() };

describe("auth.ts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("sends failed sign-ins to the app's own error page and keeps sessions short", () => {
    expect(config().pages).toEqual({ signIn: "/", error: "/auth/error" });
    expect(config().session.maxAge).toBe(12 * 60 * 60);
  });

  describe("signIn", () => {
    it("accepts a verified, allowlisted Google account", async () => {
      vi.stubEnv("ALLOWED_EMAILS", "a@example.com");
      expect(await config().callbacks.signIn({ account, profile: { email: "a@example.com", email_verified: true } })).toBe(true);
      vi.unstubAllEnvs();
    });

    it("rejects an unverified or non-allowlisted account, and any other provider", async () => {
      vi.stubEnv("ALLOWED_EMAILS", "a@example.com");
      expect(await config().callbacks.signIn({ account, profile: { email: "a@example.com", email_verified: false } })).toBe(false);
      expect(await config().callbacks.signIn({ account, profile: { email: "b@example.com", email_verified: true } })).toBe(false);
      expect(await config().callbacks.signIn({ account: { provider: "github" }, profile: {} })).toBe(false);
      expect(logAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "sign_in_rejected", detail: "not on allowlist" }));
      vi.unstubAllEnvs();
    });
  });

  describe("jwt", () => {
    it("stores the Google tokens and session version at sign-in", async () => {
      vi.mocked(currentSessionVersion).mockResolvedValue(5);
      const token = await config().callbacks.jwt({ token: {}, account });
      expect(token).toMatchObject({ googleId: "gid-1", accessToken: "a1", refreshToken: "r1", sessionVersion: 5 });
      expect(logAuditEvent).toHaveBeenCalledWith({ userId: "gid-1", action: "sign_in" });
    });

    it("fails closed when the session version can't be recorded", async () => {
      vi.mocked(currentSessionVersion).mockRejectedValue(new Error("db down"));
      const token = await config().callbacks.jwt({ token: {}, account });
      expect(token.sessionVersion).toBeUndefined();
    });

    it("applies consent only to the current legal version, and only once it is recorded", async () => {
      const base = { googleId: "gid-1", expiresAt: later() };
      vi.mocked(recordConsent).mockResolvedValue(true);
      const accepted = await config().callbacks.jwt({ token: { ...base }, trigger: "update", session: { legalVersionAccepted: LEGAL_VERSION } });
      expect(accepted.legalVersionAccepted).toBe(LEGAL_VERSION);

      vi.mocked(recordConsent).mockResolvedValue(false);
      const notStored = await config().callbacks.jwt({ token: { ...base }, trigger: "update", session: { legalVersionAccepted: LEGAL_VERSION } });
      expect(notStored.legalVersionAccepted).toBeUndefined();

      const wrongVersion = await config().callbacks.jwt({ token: { ...base }, trigger: "update", session: { legalVersionAccepted: "1999-01-01" } });
      expect(wrongVersion.legalVersionAccepted).toBeUndefined();
    });

    it("refreshes an access token that is about to expire", async () => {
      vi.mocked(refreshGoogleAccessToken).mockResolvedValue({ accessToken: "a2", expiresAt: later(), refreshToken: "r2" });
      const token = await config().callbacks.jwt({ token: { googleId: "gid-1", refreshToken: "r1", expiresAt: 0 } });
      expect(token).toMatchObject({ accessToken: "a2", refreshToken: "r2", error: undefined });
    });

    it("marks the session unusable when the refresh fails or there is no refresh token", async () => {
      vi.mocked(refreshGoogleAccessToken).mockRejectedValue(new Error("invalid_grant"));
      expect((await config().callbacks.jwt({ token: { googleId: "gid-1", refreshToken: "r1", expiresAt: 0 } })).error).toBe(
        "RefreshAccessTokenError"
      );
      expect(logAuditEvent).toHaveBeenCalledWith({ userId: "gid-1", action: "token_refresh_failed" });
      expect((await config().callbacks.jwt({ token: { googleId: "gid-1", expiresAt: 0 } })).error).toBe("RefreshAccessTokenError");
    });
  });

  it("never exposes Google tokens to the browser session", async () => {
    const session = await config().callbacks.session({
      session: { user: { email: "a@example.com" } },
      token: { accessToken: "a1", refreshToken: "r1", legalVersionAccepted: LEGAL_VERSION, legalAcceptedAt: 1 },
    });
    expect(JSON.stringify(session)).not.toMatch(/a1|r1/);
    expect(session.legalVersionAccepted).toBe(LEGAL_VERSION);
  });

  it("sign-out revokes the Google token, every session, and cached inbox data", async () => {
    vi.mocked(revokeGoogleToken).mockRejectedValue(new Error("network"));
    await config().events.signOut({ token: { googleId: "gid-1", refreshToken: "r1" } });
    expect(revokeGoogleToken).toHaveBeenCalledWith("r1");
    expect(revokeUserSessions).toHaveBeenCalledWith("gid-1");
    expect(purgeUserCaches).toHaveBeenCalledWith("gid-1");
    expect(logAuditEvent).toHaveBeenCalledWith({ userId: "gid-1", action: "sign_out" });

    vi.clearAllMocks();
    await config().events.signOut({ session: {} });
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });
});
