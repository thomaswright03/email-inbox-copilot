// Shared by playwright.config.ts (the server's environment) and the tests.
export const E2E_PORT = 3100;
export const GMAIL_STUB_PORT = 4010;
// A second server from the same build with AI features on, pointed at the
// Gemini stand-in (e2e/gemini-stub.mjs).
export const E2E_AI_PORT = 3101;
export const GEMINI_STUB_PORT = 4011;
// Test-only: signs the session cookies the tests mint (e2e/session.ts).
export const E2E_AUTH_SECRET = "e2e-only-auth-secret-0123456789abcdef";
