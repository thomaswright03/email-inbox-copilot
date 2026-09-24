"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "../I18nProvider";

// Modal confirmation for Delete: focus moves to Cancel (the safe default),
// Tab/Shift+Tab stay inside, Escape closes, and focus returns to whatever
// opened it.
export default function ConfirmDialog({
  name,
  subject,
  onCancel,
  onConfirm,
}: {
  name: string;
  subject: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === cancelRef.current) {
        e.preventDefault();
        confirmRef.current?.focus();
      } else if (!e.shiftKey && document.activeElement === confirmRef.current) {
        e.preventDefault();
        cancelRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-heading"
        aria-describedby="confirm-delete-body"
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-delete-heading" className="text-sm font-semibold">
          {t("confirm.title")}
        </h2>
        <p id="confirm-delete-body" className="mt-2 text-sm text-muted">
          {t("confirm.body", { name, subject })}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="tap-h rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
          >
            {t("confirm.cancel")}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="tap-h rounded-lg bg-danger px-3 text-sm font-medium text-danger-foreground transition-colors hover:opacity-90"
          >
            {t("confirm.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
