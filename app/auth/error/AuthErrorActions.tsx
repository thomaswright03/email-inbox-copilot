"use client";

import { signIn } from "next-auth/react";

// "Try a different Google account" shows Google's account chooser.
export default function AuthErrorActions({ primaryLabel, chooseAccount }: { primaryLabel: string; chooseAccount: boolean }) {
  return (
    <button
      onClick={() =>
        void signIn("google", { redirectTo: "/" }, chooseAccount ? { prompt: "select_account consent" } : undefined)
      }
      className="tap-h mt-5 w-full rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90"
    >
      {primaryLabel}
    </button>
  );
}
