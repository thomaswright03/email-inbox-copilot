"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Sparkles } from "lucide-react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-3.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
          </div>
          <span className="text-sm font-semibold tracking-tight">Inbox Buddy</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          An unexpected error occurred. You can try again, or head back to the dashboard.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            Try again
          </button>
          <Link
            href="/"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            Back to Inbox Buddy
          </Link>
        </div>
      </main>
    </div>
  );
}
