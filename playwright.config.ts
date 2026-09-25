import { defineConfig, devices } from "@playwright/test";
import {
  E2E_AI_PORT as AI_PORT,
  E2E_AUTH_SECRET,
  E2E_PORT as PORT,
  GEMINI_STUB_PORT,
  GMAIL_STUB_PORT as STUB_PORT,
} from "./e2e/constants";

const SERVER_ENV = {
  AUTH_SECRET: E2E_AUTH_SECRET,
  AUTH_TRUST_HOST: "true",
  AUTH_GOOGLE_ID: "e2e-client-id",
  AUTH_GOOGLE_SECRET: "e2e-client-secret",
  ALLOWED_EMAILS: "tester@example.com",
  // Turns on the Google stand-ins below (lib/stand-ins.ts); without it the
  // app ignores GMAIL_API_ROOT_URL and GEMINI_API_ROOT_URL.
  E2E_STAND_INS: "1",
  GMAIL_API_ROOT_URL: `http://127.0.0.1:${STUB_PORT}/`,
  DATABASE_URL: "",
};

// End-to-end tests against a production build (`npm run build` first).
// Google is replaced at its two edges: sign-in by a session cookie minted
// with the test AUTH_SECRET (e2e/session.ts), and the Gmail API by a local
// stand-in (e2e/gmail-stub.mjs). On the main server AI is off and there is
// no database, as on a fresh deployment before GEMINI_PAID_TIER_PROJECT and
// DATABASE_URL are set. A second server from the same build has AI on, with
// Gemini replaced by a stand-in too (e2e/gemini-stub.mjs), for
// e2e/briefing.spec.ts.
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Lets a machine without Playwright's own browser download use an
        // installed Chromium instead.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: "node e2e/gmail-stub.mjs",
      url: `http://127.0.0.1:${STUB_PORT}/__health`,
      env: { GMAIL_STUB_PORT: String(STUB_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node e2e/gemini-stub.mjs",
      url: `http://127.0.0.1:${GEMINI_STUB_PORT}/__health`,
      env: { GEMINI_STUB_PORT: String(GEMINI_STUB_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/privacy`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: { ...SERVER_ENV, GEMINI_API_KEY: "", GEMINI_PAID_TIER_PROJECT: "" },
    },
    {
      command: `npx next start -p ${AI_PORT}`,
      url: `http://localhost:${AI_PORT}/privacy`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...SERVER_ENV,
        GEMINI_API_KEY: "e2e-stand-in-key",
        GEMINI_PAID_TIER_PROJECT: "e2e-stand-in",
        GEMINI_API_ROOT_URL: `http://127.0.0.1:${GEMINI_STUB_PORT}`,
        // e2e/briefing.spec.ts checks the deadline bucket and "Due today".
        AI_DEADLINE_DETECTION: "1",
      },
    },
  ],
});
