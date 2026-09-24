import { defineConfig, devices } from "@playwright/test";
import { E2E_AUTH_SECRET, E2E_PORT as PORT, GMAIL_STUB_PORT as STUB_PORT } from "./e2e/constants";

// End-to-end tests against a production build (`npm run build` first).
// Google is replaced at its two edges: sign-in by a session cookie minted
// with the test AUTH_SECRET (e2e/session.ts), and the Gmail API by a local
// stand-in (e2e/gmail-stub.mjs). AI is off and there is no database, as on
// a fresh deployment before GEMINI_PAID_TIER_PROJECT and DATABASE_URL are set.
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
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/privacy`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        AUTH_SECRET: E2E_AUTH_SECRET,
        AUTH_TRUST_HOST: "true",
        AUTH_GOOGLE_ID: "e2e-client-id",
        AUTH_GOOGLE_SECRET: "e2e-client-secret",
        ALLOWED_EMAILS: "tester@example.com",
        GMAIL_API_ROOT_URL: `http://127.0.0.1:${STUB_PORT}/`,
        GEMINI_API_KEY: "",
        GEMINI_PAID_TIER_PROJECT: "",
        DATABASE_URL: "",
      },
    },
  ],
});
