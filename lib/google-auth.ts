// Exchanges a stored Google refresh token for a fresh access token. Used by
// the NextAuth jwt callback so a user's session survives past the ~1 hour
// Google access-token lifetime without forcing a full re-sign-in.
export type RefreshedGoogleToken = {
  accessToken: string;
  expiresAt: number; // seconds since epoch
  refreshToken: string; // Google doesn't always rotate this; caller should keep the old one if absent
};

export async function refreshGoogleAccessToken(refreshToken: string): Promise<RefreshedGoogleToken> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error_description ?? data.error ?? "Failed to refresh Google access token");
  }

  return {
    accessToken: data.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    refreshToken: data.refresh_token ?? refreshToken,
  };
}
