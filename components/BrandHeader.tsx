import Link from "next/link";
import { Sparkles } from "lucide-react";
import Preferences from "./Preferences";

// Header for the standalone pages (404, errors, sign-in errors, legal).
export default function BrandHeader({ appName }: { appName: string }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
        <Link href="/" className="tap-h flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
          </span>
          <span className="text-sm font-semibold tracking-tight">{appName}</span>
        </Link>
        <Preferences />
      </div>
    </header>
  );
}
