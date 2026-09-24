import type { BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { LEGAL_VERSION } from "../content/legal";
import { E2E_AUTH_SECRET, GMAIL_STUB_PORT } from "./constants";

// `next start` runs in production mode, where the session cookie is the
// __Secure- one (lib/session-cookie.ts).
const COOKIE = "__Secure-authjs.session-token";

let counter = 0;

// Signs a test user in by writing the session cookie Auth.js would have
// written after a Google sign-in. Each call is a new user with its own
// Gmail stand-in inbox (keyed by the access token), so tests don't share
// caches or state. Returns the access token, for reading the stand-in's
// record of Gmail changes.
export async function signInAs(
  context: BrowserContext,
  options: { consented?: boolean; accessToken?: string } = {}
): Promise<string> {
  const id = `${process.pid}-${Date.now()}-${++counter}`;
  const accessToken = options.accessToken ?? `tok-${id}`;
  const value = await encode({
    secret: E2E_AUTH_SECRET,
    salt: COOKIE,
    token: {
      sub: `gid-${id}`,
      googleId: `gid-${id}`,
      email: "tester@example.com",
      name: "Test User",
      accessToken,
      refreshToken: "refresh-unused",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      ...(options.consented === false ? {} : { legalVersionAccepted: LEGAL_VERSION, legalAcceptedAt: Date.now() }),
    },
  });
  await context.addCookies([
    { name: COOKIE, value, domain: "localhost", path: "/", httpOnly: true, secure: true, sameSite: "Lax" },
  ]);
  return accessToken;
}

export async function gmailChanges(accessToken: string): Promise<{ verb: string; id: string }[]> {
  const res = await fetch(`http://127.0.0.1:${GMAIL_STUB_PORT}/__calls?token=${encodeURIComponent(accessToken)}`);
  return (await res.json()) as { verb: string; id: string }[];
}
