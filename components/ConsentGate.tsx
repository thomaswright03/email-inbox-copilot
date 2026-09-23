"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { LEGAL_VERSION } from "@/content/legal";

export default function ConsentGate() {
  const { update } = useSession();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleAgree() {
    setSubmitting(true);
    await update({ legalVersionAccepted: LEGAL_VERSION });
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-warning-soft">
          <ShieldAlert className="h-5 w-5 text-warning" strokeWidth={2} />
        </div>

        <h1 className="text-base font-semibold tracking-tight">Before you continue</h1>

        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
          <li>
            • The sender, subject, and a short preview of your recent emails are sent to Google&apos;s Gemini API
            to generate your summary and detect spam.
          </li>
          <li>
            • AI summaries can be incomplete or wrong — always check your inbox directly for anything
            time-sensitive or important.
          </li>
          <li>• Delete and Unsubscribe take real, immediate action on your Gmail account.</li>
        </ul>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-accent"
          />
          <span>
            I have read and agree to the{" "}
            <Link href="/terms" target="_blank" className="text-accent underline underline-offset-2">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-accent underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </span>
        </label>

        <button
          onClick={handleAgree}
          disabled={!checked || submitting}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Continuing…" : "Agree & Continue"}
        </button>

        <button
          onClick={() => signOut()}
          className="mt-3 w-full text-center text-xs text-muted hover:text-foreground"
        >
          Not now — sign out instead
        </button>
      </div>
    </div>
  );
}
