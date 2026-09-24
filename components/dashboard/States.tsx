"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { signIn } from "next-auth/react";
import { useI18n } from "../I18nProvider";

export function SkeletonLines() {
  return (
    <div className="animate-pulse space-y-3" aria-hidden>
      <div className="h-3.5 w-1/3 rounded bg-surface-hover" />
      <div className="h-3.5 w-full rounded bg-surface-hover" />
      <div className="h-3.5 w-5/6 rounded bg-surface-hover" />
      <div className="h-3.5 w-2/3 rounded bg-surface-hover" />
    </div>
  );
}

export function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-surface-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-2/5 rounded bg-surface-hover" />
              <div className="h-3 w-4/5 rounded bg-surface-hover" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// After a few seconds of loading, says so, so a slow load doesn't look
// frozen. Mounted only while loading; a load that never answers ends in an
// error after FETCH_TIMEOUT_MS (lib/client-fetch.ts).
export const SLOW_AFTER_MS = 5_000;

export function SlowNotice() {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <p role="status" className="mt-3 text-sm text-muted">
      {slow ? t("errors.slow") : ""}
    </p>
  );
}

// Signs in again with Google to restore Gmail access.
export function reconnectGmail() {
  void signIn("google");
}

export function ErrorState({ message, reconnect, onRetry }: { message: string; reconnect: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-danger/40 bg-danger-soft/40 px-4 py-14 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} aria-hidden />
      <p className="max-w-xs text-sm text-danger">{message}</p>
      <button
        onClick={reconnect ? reconnectGmail : onRetry}
        className="tap-h mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
      >
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {reconnect ? t("errors.reconnect") : t("errors.retry")}
      </button>
    </div>
  );
}
