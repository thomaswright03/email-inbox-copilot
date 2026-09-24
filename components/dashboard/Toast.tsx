"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useI18n } from "../I18nProvider";

export type ToastState = { id: number; tone: "success" | "warning"; message: string; onUndo?: () => void };

const DURATION_MS = 8000;

// One toast at a time, with an optional Undo and a close button; it goes
// away on its own after 8 seconds.
export default function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  const { t } = useI18n();

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(onDismiss, DURATION_MS);
    return () => clearTimeout(timeout);
  }, [toast, onDismiss]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4" role="status" aria-live="polite">
      {toast && (
        <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-3.5 pr-1.5 text-sm shadow-lg">
          {toast.tone === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" strokeWidth={2} aria-hidden />
          )}
          <span className="flex-1 py-1">{toast.message}</span>
          {toast.onUndo && (
            <button
              onClick={toast.onUndo}
              className="tap-h shrink-0 rounded-md px-2.5 font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              {t("toast.undo")}
            </button>
          )}
          <button
            onClick={onDismiss}
            aria-label={t("toast.dismiss")}
            title={t("toast.dismiss")}
            className="tap-target flex shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
