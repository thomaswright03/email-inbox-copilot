import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // lib/ai.ts constructs its Gemini client at module load time; give it a
    // placeholder key in tests so importing the module doesn't warn.
    // GEMINI_PAID_TIER_PROJECT turns AI on; tests of the AI-off path unset it.
    env: { GEMINI_API_KEY: "test-key", GEMINI_PAID_TIER_PROJECT: "test-paid-project", AUTH_SECRET: "test-auth-secret-for-vitest-only" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
