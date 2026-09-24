import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "../session-cookie";

async function cookieFor(token: Record<string, unknown>) {
  const value = await encode({ token, secret: process.env.AUTH_SECRET!, salt: SESSION_COOKIE_NAME });
  return `${SESSION_COOKIE_NAME}=${value}`;
}

describe("proxy: API routes are authenticated by default", () => {
  it("refuses an API route (even one that doesn't exist yet) without a session", async () => {
    const res = await proxy(new NextRequest("http://localhost/api/some-new-route"));
    expect(res.status).toBe(401);
  });

  it("refuses a forged or garbage session cookie", async () => {
    const res = await proxy(
      new NextRequest("http://localhost/api/emails/today", { headers: { cookie: `${SESSION_COOKIE_NAME}=forged` } })
    );
    expect(res.status).toBe(401);
  });

  it("lets a request with a valid session through to the route's own checks", async () => {
    const cookie = await cookieFor({ googleId: "g1", email: "a@example.com" });
    const res = await proxy(new NextRequest("http://localhost/api/emails/today", { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("leaves Auth.js's own endpoints reachable", async () => {
    const res = await proxy(new NextRequest("http://localhost/api/auth/signin"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("sets a nonce-based CSP on pages", async () => {
    const res = await proxy(new NextRequest("http://localhost/"));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-inline");
  });
});
