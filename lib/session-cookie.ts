// The session cookie's name is pinned (rather than left to Auth.js to infer
// from each request's protocol) so the server-side token reader in
// lib/session.ts always decodes exactly the cookie Auth.js wrote. In
// production the cookie is `__Secure-` prefixed, HttpOnly, Secure and
// SameSite=Lax.
export const USE_SECURE_COOKIES = process.env.NODE_ENV === "production";

export const SESSION_COOKIE_NAME = `${USE_SECURE_COOKIES ? "__Secure-" : ""}authjs.session-token`;
