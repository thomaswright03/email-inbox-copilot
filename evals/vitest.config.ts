import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

// Only the Gemini settings are taken from .env / .env.local, so an eval run
// never picks up database or session secrets.
const fromFiles = loadEnv("development", path.resolve(__dirname, ".."), ["GEMINI_"]);

export default defineConfig({
  test: {
    root: path.resolve(__dirname, ".."),
    include: ["evals/**/*.eval.ts"],
    environment: "node",
    testTimeout: 5 * 60 * 1000,
    env: {
      GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? fromFiles.GEMINI_API_KEY ?? "",
      GEMINI_PAID_TIER_PROJECT: process.env.GEMINI_PAID_TIER_PROJECT ?? fromFiles.GEMINI_PAID_TIER_PROJECT ?? "",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "..") },
  },
});
