"use client";

import { signIn } from "next-auth/react";
import { Sparkles } from "lucide-react";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.61Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.81.54-1.85.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.04l3-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.96l3 2.34C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function SignIn() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(600px circle at 15% 20%, var(--accent-soft), transparent 60%), radial-gradient(500px circle at 85% 80%, var(--accent-soft), transparent 60%)",
        }}
      />

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
          <Sparkles className="h-5 w-5 text-accent" strokeWidth={2} />
        </div>

        <h1 className="text-lg font-semibold tracking-tight">Inbox Copilot</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Connect Gmail for a daily summary of what matters, and a spam tab that catches what your junk folder
          missed.
        </p>

        <button
          onClick={() => signIn("google")}
          className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <p className="mt-5 text-center text-xs text-muted">
          Read‑only until you delete, unsubscribe, or ignore something yourself.
        </p>
      </div>
    </div>
  );
}
