import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

// Lets the operator match an emailed copy or deletion request to a Google
// account (Privacy Policy section 6). The signed-in dashboard shows the user
// a request code: their Google account id, email address and the time,
// signed with a key derived from AUTH_SECRET. The operator checks it with
// `node scripts/user-data.mjs verify <code>` before acting, and compares the
// email inside it with the address the request came from. Keep the format
// and key derivation in step with scripts/user-data.mjs.

export type DataRequestClaims = { u: string; e: string; t: number };

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "inbox-buddy", "inbox-buddy:data-request", 32));
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(payload).digest("base64url");
}

export function createDataRequestCode(
  userId: string,
  email: string,
  now = Date.now(),
  secret = process.env.AUTH_SECRET
): string | null {
  if (!secret || !userId || !email) return null;
  const payload = Buffer.from(JSON.stringify({ u: userId, e: email, t: Math.floor(now / 1000) })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyDataRequestCode(code: string, secret = process.env.AUTH_SECRET): DataRequestClaims | null {
  if (!secret) return null;
  const [payload, mac, extra] = code.trim().split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DataRequestClaims;
    if (typeof claims.u !== "string" || typeof claims.e !== "string" || typeof claims.t !== "number") return null;
    return claims;
  } catch {
    return null;
  }
}
