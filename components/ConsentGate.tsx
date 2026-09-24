"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { CONTACT_EMAIL, LEGAL_VERSION } from "@/content/legal";
import Preferences from "./Preferences";
import { useI18n } from "./I18nProvider";

export default function ConsentGate({ storageReady }: { storageReady: boolean }) {
  const { update } = useSession();
  const router = useRouter();
  const { t } = useI18n();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  // The server applies the acceptance only after storing a record of it
  // (auth.ts); if that fails the returned session doesn't carry it.
  async function handleAgree() {
    setSubmitting(true);
    setFailed(false);
    const next = await update({ legalVersionAccepted: LEGAL_VERSION }).catch(() => null);
    if (next?.legalVersionAccepted === LEGAL_VERSION) {
      router.refresh();
      return;
    }
    setFailed(true);
    setSubmitting(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Preferences className="mb-4 self-end sm:absolute sm:right-4 sm:top-4 sm:mb-0" />
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-warning-soft">
          <ShieldAlert className="h-5 w-5 text-warning" strokeWidth={2} aria-hidden />
        </div>

        <h1 className="text-base font-semibold tracking-tight">{t("consent.title")}</h1>

        <ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted">
          <li>{t("consent.ai")}</li>
          <li>{t("consent.accuracy")}</li>
          <li>{t("consent.actions")}</li>
          <li>{t("consent.scope")}</li>
        </ul>

        {!storageReady ? (
          <p role="alert" className="mt-5 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
            {t("consent.notSetUp", { email: CONTACT_EMAIL })}
          </p>
        ) : (
          <>
            <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-accent"
              />
              <span>
                {t("consent.checkboxPrefix")}{" "}
                <Link href="/terms" target="_blank" className="text-accent underline underline-offset-2">
                  {t("legal.terms")}
                </Link>{" "}
                {t("signin.and")}{" "}
                <Link href="/privacy" target="_blank" className="text-accent underline underline-offset-2">
                  {t("legal.privacy")}
                </Link>
                .
              </span>
            </label>

            <button
              onClick={handleAgree}
              disabled={!checked || submitting}
              className="tap-h mt-5 w-full rounded-lg bg-accent px-4 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? t("consent.continuing") : t("consent.agree")}
            </button>

            {failed && (
              <p role="alert" className="mt-3 text-center text-xs text-danger">
                {t("consent.saveFailed")}
              </p>
            )}
          </>
        )}

        <button
          onClick={() => void signOut()}
          className="tap-h mt-3 w-full text-center text-xs text-muted hover:text-foreground"
        >
          {t("consent.signOut")}
        </button>
      </div>
    </div>
  );
}
