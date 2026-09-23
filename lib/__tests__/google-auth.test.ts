import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { refreshGoogleAccessToken } from "../google-auth";

describe("refreshGoogleAccessToken", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.AUTH_GOOGLE_ID = "test-client-id";
    process.env.AUTH_GOOGLE_SECRET = "test-client-secret";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exchanges a refresh token for a new access token", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "new-token", expires_in: 3600 }), { status: 200 })
    );

    const result = await refreshGoogleAccessToken("old-refresh-token");
    expect(result.accessToken).toBe("new-token");
    expect(result.refreshToken).toBe("old-refresh-token"); // Google didn't rotate it
    expect(result.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it("keeps the new refresh token when Google rotates it", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ access_token: "new-token", expires_in: 3600, refresh_token: "rotated-token" }),
        { status: 200 }
      )
    );

    const result = await refreshGoogleAccessToken("old-refresh-token");
    expect(result.refreshToken).toBe("rotated-token");
  });

  it("throws when Google rejects the refresh token", async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), {
        status: 400,
      })
    );

    await expect(refreshGoogleAccessToken("revoked-token")).rejects.toThrow(/expired or revoked/);
  });

  it("throws if client credentials are missing", async () => {
    delete process.env.AUTH_GOOGLE_ID;
    await expect(refreshGoogleAccessToken("x")).rejects.toThrow(/AUTH_GOOGLE_ID/);
  });
});
