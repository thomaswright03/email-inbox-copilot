import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function NotFound() {
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
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted">
          The page you&apos;re looking for doesn&apos;t exist or may have moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3.5 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Back to Inbox Buddy
        </Link>
      </main>
    </div>
  );
}
