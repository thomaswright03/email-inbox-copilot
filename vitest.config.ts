import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    // lib/ai.ts constructs its Gemini client at module load time; give it a
    // placeholder key in tests so importing the module doesn't warn.
    env: { GEMINI_API_KEY: "test-key" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
