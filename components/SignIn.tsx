"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { AlertTriangle, Sparkles } from "lucide-react";
import { CONTACT_EMAIL } from "@/content/legal";
import Preferences from "./Preferences";
import { useI18n } from "./I18nProvider";

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

export default function SignIn({ storeUnavailable = false }: { storeUnavailable?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="signin-glow pointer-events-none absolute inset-0 -z-10" />
      <Preferences className="mb-4 self-end sm:absolute sm:right-4 sm:top-4 sm:mb-0" />

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-sm">
        <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
          <Sparkles className="h-5 w-5 text-accent" strokeWidth={2} aria-hidden />
        </div>

        <h1 className="text-lg font-semibold tracking-tight">{t("app.name")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t("signin.tagline")}</p>

        {storeUnavailable && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            <span>{t("signin.storeUnavailable", { email: CONTACT_EMAIL })}</span>
          </div>
        )}

        <button
          onClick={() => void signIn("google")}
          className="tap-h mt-6 flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface px-4 text-sm font-medium transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <GoogleIcon />
          {t("signin.continue")}
        </button>

        <p className="mt-5 text-center text-xs text-muted">
          {t("signin.agreePrefix")}{" "}
          <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-foreground">
            {t("legal.terms")}
          </Link>{" "}
          {t("signin.and")}{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-foreground">
            {t("legal.privacy")}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
