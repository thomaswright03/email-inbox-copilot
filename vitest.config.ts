import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // Server code runs in Node; component tests opt into jsdom with a
    // `// @vitest-environment jsdom` line at the top of the file.
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    // e2e/ is Playwright (npm run test:e2e); evals/ calls the real model
    // (npm run eval).
    exclude: ["node_modules/**", ".next/**", "e2e/**", "evals/**"],
    // GEMINI_PAID_TIER_PROJECT turns AI on; tests of the AI-off path unset it.
    env: { GEMINI_API_KEY: "test-key", GEMINI_PAID_TIER_PROJECT: "test-paid-project", AUTH_SECRET: "test-auth-secret-for-vitest-only" },
    coverage: {
      provider: "v8",
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "auth.ts", "proxy.ts"],
      exclude: ["**/*.test.{ts,tsx}", "**/__tests__/**"],
      reporter: ["text-summary", "text"],
      // CI fails when coverage drops below these (npm run test:coverage).
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 80 },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
