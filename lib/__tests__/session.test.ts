import { describe, it, expect, vi, beforeEach } from "vitest";
import { encode } from "next-auth/jwt";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("../session-store", () => ({ checkSessionVersion: vi.fn() }));
vi.mock("../google-auth", () => ({ refreshGoogleAccessToken: vi.fn() }));

import { checkSessionVersion } from "../session-store";
import { refreshGoogleAccessToken } from "../google-auth";
import { getGoogleSession, readGoogleSession } from "../session";
import { SESSION_COOKIE_NAME } from "../session-cookie";
import { LEGAL_VERSION } from "@/content/legal";

const SECRET = "test-auth-secret-for-vitest-only";
const inAnHour = () => Math.floor(Date.now() / 1000) + 3600;

async function cookieHeaders(token: Record<string, unknown>): Promise<Headers> {
  const value = await encode({ token, secret: SECRET, salt: SESSION_COOKIE_NAME });
  return new Headers({ cookie: `${SESSION_COOKIE_NAME}=${value}` });
}

const BASE = {
  googleId: "gid-1",
  email: "a@example.com",
  name: "Ana",
  accessToken: "access-1",
  refreshToken: "refresh-1",
  sessionVersion: 7,
  legalVersionAccepted: LEGAL_VERSION,
};

describe("getGoogleSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(checkSessionVersion).mockResolvedValue("valid");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("returns the server-side view of a valid, consented session", async () => {
    const session = await getGoogleSession(await cookieHeaders({ ...BASE, expiresAt: inAnHour() }));
    expect(session).toEqual({ userId: "gid-1", userEmail: "a@example.com", userName: "Ana", accessToken: "access-1", consented: true });
    expect(checkSessionVersion).toHaveBeenCalledWith("gid-1", 7);
  });

  it("marks a session that hasn't accepted the current terms", async () => {
    const session = await getGoogleSession(await cookieHeaders({ ...BASE, legalVersionAccepted: "old", expiresAt: inAnHour() }));
    expect(session?.consented).toBe(false);
  });

  it("returns null without a cookie, with a broken cookie, or with a token error", async () => {
    expect(await getGoogleSession(new Headers())).toBeNull();
    expect(await getGoogleSession(new Headers({ cookie: `${SESSION_COOKIE_NAME}=garbage` }))).toBeNull();
    expect(await getGoogleSession(await cookieHeaders({ ...BASE, error: "RefreshAccessTokenError" }))).toBeNull();
    expect(await getGoogleSession(await cookieHeaders({ ...BASE, googleId: undefined }))).toBeNull();
  });

  it("refuses a cookie from before a sign-out or revocation", async () => {
    vi.mocked(checkSessionVersion).mockResolvedValue("revoked");
    expect(await readGoogleSession(await cookieHeaders({ ...BASE, expiresAt: inAnHour() }))).toEqual({ session: null, problem: null });
  });

  it("reports a cookie refused because the session store can't be read", async () => {
    vi.mocked(checkSessionVersion).mockResolvedValue("unavailable");
    expect(await readGoogleSession(await cookieHeaders({ ...BASE, expiresAt: inAnHour() }))).toEqual({
      session: null,
      problem: "store_unavailable",
    });
    expect(await readGoogleSession(new Headers())).toEqual({ session: null, problem: null });
  });

  it("refreshes an expired access token without writing anything back", async () => {
    vi.mocked(refreshGoogleAccessToken).mockResolvedValue({ accessToken: "access-2", expiresAt: inAnHour(), refreshToken: "refresh-1" });
    const session = await getGoogleSession(await cookieHeaders({ ...BASE, expiresAt: 0 }));
    expect(refreshGoogleAccessToken).toHaveBeenCalledWith("refresh-1");
    expect(session?.accessToken).toBe("access-2");
  });

  it("returns null when the token is expired and can't be refreshed", async () => {
    vi.mocked(refreshGoogleAccessToken).mockRejectedValue(new Error("invalid_grant"));
    expect(await getGoogleSession(await cookieHeaders({ ...BASE, expiresAt: 0 }))).toBeNull();
    expect(await getGoogleSession(await cookieHeaders({ ...BASE, expiresAt: 0, refreshToken: undefined }))).toBeNull();
  });

  it("reads the request's own headers when none are passed, and fails closed without AUTH_SECRET", async () => {
    expect(await getGoogleSession()).toBeNull();
    vi.stubEnv("AUTH_SECRET", "");
    expect(await getGoogleSession(await cookieHeaders({ ...BASE, expiresAt: inAnHour() }))).toBeNull();
    vi.unstubAllEnvs();
  });

  it("reports a missing AUTH_SECRET at error level at runtime, but not while next build renders pages", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(await getGoogleSession(new Headers())).toBeNull();
    expect(error).not.toHaveBeenCalled();

    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    expect(await getGoogleSession(new Headers())).toBeNull();
    expect(error.mock.calls.map(([line]) => String(line)).join("\n")).toMatch(/"level":"error".*AUTH_SECRET is not set/);
    vi.unstubAllEnvs();
    error.mockRestore();
  });
});
