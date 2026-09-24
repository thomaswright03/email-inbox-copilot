"use client";

import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import BrandHeader from "@/components/BrandHeader";
import { useI18n } from "@/components/I18nProvider";

// The error itself is logged server-side (by digest); nothing is written to
// the browser console, where extensions and shared devices can read it.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col">
      <BrandHeader appName={t("app.name")} />

      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} aria-hidden />
        <h1 className="mt-3 text-xl font-semibold tracking-tight">{t("error.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("error.body")}</p>
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => reset()}
            className="tap-h inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t("errors.retry")}
          </button>
          <Link href="/" className="tap-h inline-flex items-center text-sm text-muted transition-colors hover:text-foreground">
            {t("legal.back")}
          </Link>
        </div>
      </main>
    </div>
  );
}
