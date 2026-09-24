"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SPAM_REASON_LABEL, type SpamReason } from "@/lib/spam-reasons";
import {
  Inbox,
  LogOut,
  MailX,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  EyeOff,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";

type TodayResponse = {
  summary: string;
  aiGenerated: boolean;
  count: number;
  emails: { id: string; from: string; subject: string; snippet: string; date: string }[];
};

type SpamCard = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  hasUnsubscribe: boolean;
  reason: SpamReason;
};

type Tab = "summary" | "spam";

const ACTION_LABEL: Record<"delete" | "unsubscribe" | "ignore", string> = {
  delete: "Deleted",
  unsubscribe: "Unsubscribed and archived",
  ignore: "Ignored",
};

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^"?([^"<]*)"?\s*<([^>]+)>$/);
  if (match) {
    const name = match[1].trim();
    return { name: name || match[2], email: match[2] };
  }
  return { name: from, email: from };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function SkeletonLines() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-3.5 w-1/3 rounded bg-surface-hover" />
      <div className="h-3.5 w-full rounded bg-surface-hover" />
      <div className="h-3.5 w-5/6 rounded bg-surface-hover" />
      <div className="h-3.5 w-2/3 rounded bg-surface-hover" />
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-danger/40 bg-danger-soft/40 py-14 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-danger" strokeWidth={1.5} />
      <p className="max-w-xs text-sm text-danger">{message}</p>
      <button
        onClick={onRetry}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
      >
        <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
        Try again
      </button>
    </div>
  );
}

export default function Dashboard({ userName }: { userName: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const initialTab: Tab = searchParams.get("tab") === "spam" ? "spam" : "summary";

  const [tab, setTabState] = useState<Tab>(initialTab);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [spamCards, setSpamCards] = useState<SpamCard[] | null>(null);
  const [spamAiGenerated, setSpamAiGenerated] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSpam, setLoadingSpam] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [spamError, setSpamError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<{ id: string; name: string; subject: string } | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  function setTab(next: Tab) {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "summary") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }

  // These only perform the fetch itself — no synchronous setState before the
  // first await, so they're safe to call directly from the mount effect
  // below. Callers that need to reset loading/error state first (retries)
  // do so explicitly at the call site.
  const fetchSummary = useCallback(() => {
    fetch("/api/emails/today")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Couldn't load your summary");
        setToday(data);
      })
      .catch((err: Error) => setSummaryError(err.message))
      .finally(() => setLoadingSummary(false));
  }, []);

  const fetchSpam = useCallback(() => {
    fetch("/api/emails/spam")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Couldn't check for spam");
        setSpamCards(data.flashcards);
        setSpamAiGenerated(Boolean(data.aiGenerated));
      })
      .catch((err: Error) => setSpamError(err.message))
      .finally(() => setLoadingSpam(false));
  }, []);

  const loadSummary = useCallback(() => {
    setLoadingSummary(true);
    setSummaryError(null);
    fetchSummary();
  }, [fetchSummary]);

  const loadSpam = useCallback(() => {
    setLoadingSpam(true);
    setSpamError(null);
    fetchSpam();
  }, [fetchSpam]);

  useEffect(() => {
    fetchSummary();
    fetchSpam();
    // Only on mount — loadingSummary/loadingSpam/errors already start at
    // their correct initial values, so there's nothing to reset here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The Google access token couldn't be refreshed (e.g. the refresh token
    // was revoked) — the session is no longer usable, so sign out cleanly
    // and send the user back to a fresh sign-in rather than leaving them on
    // a dashboard where every API call will keep failing.
    if (session?.error === "RefreshAccessTokenError") {
      signOut();
    }
  }, [session?.error]);

  useEffect(() => {
    if (!successMessage) return;
    const timeout = setTimeout(() => setSuccessMessage(null), 3000);
    return () => clearTimeout(timeout);
  }, [successMessage]);

  // Keyboard/screen-reader support for the delete-confirmation dialog: move
  // focus in on open (to the non-destructive default), trap Tab/Shift+Tab
  // between its two buttons so focus can't silently land on page content
  // behind the overlay, close on Escape, and restore focus to whatever
  // triggered it on close — matching the standard modal dialog pattern.
  useEffect(() => {
    if (!confirmingDelete) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setConfirmingDelete(null);
        return;
      }
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === cancelButtonRef.current) {
        e.preventDefault();
        deleteButtonRef.current?.focus();
      } else if (!e.shiftKey && document.activeElement === deleteButtonRef.current) {
        e.preventDefault();
        cancelButtonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [confirmingDelete]);

  async function handleAction(action: "delete" | "unsubscribe" | "ignore", messageId: string) {
    setActionError(null);
    setPendingId(messageId);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, messageId }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setActionError(data.error ?? "Action failed");
        return;
      }
      setSuccessMessage(`${ACTION_LABEL[action]} "${spamCards?.find((c) => c.id === messageId)?.subject ?? "email"}"`);
      setRemovingIds((prev) => new Set(prev).add(messageId));
      setTimeout(() => {
        setSpamCards((prev) => prev?.filter((c) => c.id !== messageId) ?? null);
        setRemovingIds((prev) => {
          const next = new Set(prev);
          next.delete(messageId);
          return next;
        });
      }, 180);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft">
              <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold tracking-tight">Inbox Buddy</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted sm:inline">{userName}</span>
            <button
              onClick={() => signOut()}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
          <button
            onClick={() => setTab("summary")}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === "summary" ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Today&apos;s Summary
          </button>
          <button
            onClick={() => setTab("spam")}
            className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === "spam" ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Spam Flashcards
            {spamCards && spamCards.length > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-soft px-1 text-[11px] font-semibold text-warning">
                {spamCards.length}
              </span>
            )}
          </button>
        </div>

        {tab === "summary" && (
          <div>
            {!loadingSummary && !summaryError && (
              <div className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted">
                <Inbox className="h-3.5 w-3.5" strokeWidth={2} />
                {today?.count ?? 0} messages today
              </div>
            )}

            {summaryError ? (
              <ErrorState message={summaryError} onRetry={loadSummary} />
            ) : (
              <div className="rounded-2xl border border-border bg-surface p-5">
                {loadingSummary ? (
                  <SkeletonLines />
                ) : (
                  <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-headings:text-sm prose-headings:font-semibold prose-p:leading-relaxed prose-li:my-0.5">
                    {/* The summary is model output over attacker-written emails: raw
                        HTML is skipped and links/images are rendered as
                        their text only, so an injected prompt can't plant a
                        phishing link or a data-exfiltrating image URL. */}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      skipHtml
                      disallowedElements={["a", "img"]}
                      unwrapDisallowed
                    >
                      {today?.summary ?? ""}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            )}
            {!loadingSummary && !summaryError && today && (
              <p className="mt-2 text-xs text-muted">
                {today.aiGenerated
                  ? "AI-generated summary. It can miss or misstate things, so check your inbox for anything important."
                  : "Rule-based list (AI summaries are off). Check your inbox for anything important."}
              </p>
            )}
          </div>
        )}

        {tab === "spam" && (
          <div>
            {actionError && (
              <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                {actionError}
              </div>
            )}

            {!loadingSpam && !spamError && (
              <p className="mb-3 text-xs text-muted">
                {spamAiGenerated
                  ? "Flagged by AI. These are suggestions and can be wrong, so check each one before you act."
                  : "Flagged by simple rules (AI is off). These are suggestions and can be wrong, so check each one before you act."}
              </p>
            )}

            {spamError ? (
              <ErrorState message={spamError} onRetry={loadSpam} />
            ) : loadingSpam ? (
              <SkeletonCards />
            ) : spamCards && spamCards.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {spamCards.map((card) => {
                  const { name, email } = parseSender(card.from);
                  const isRemoving = removingIds.has(card.id);
                  const isPending = pendingId === card.id;
                  return (
                    <div
                      key={card.id}
                      className={`rounded-2xl border border-border bg-surface p-4 transition-all duration-200 ${
                        isRemoving ? "scale-95 opacity-0" : "opacity-100 hover:border-foreground/15 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
                          {initials(name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium" title={email}>
                            {name}
                          </p>
                          <p className="truncate text-sm text-muted">{card.subject}</p>
                        </div>
                      </div>

                      <p className="mt-3 line-clamp-2 text-xs text-muted">{card.snippet}</p>

                      {SPAM_REASON_LABEL[card.reason] && (
                        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                          {SPAM_REASON_LABEL[card.reason]}
                        </div>
                      )}

                      <div className="mt-3.5 flex gap-2">
                        <button
                          onClick={() => setConfirmingDelete({ id: card.id, name, subject: card.subject })}
                          disabled={isPending}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-danger-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          {isPending ? "Working…" : "Delete"}
                        </button>
                        <button
                          onClick={() => handleAction("unsubscribe", card.id)}
                          title="Asks the sender to unsubscribe you, then archives this message"
                          disabled={!card.hasUnsubscribe || isPending}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted disabled:hover:bg-surface-hover disabled:hover:text-muted disabled:opacity-60"
                        >
                          <MailX className="h-3.5 w-3.5" strokeWidth={2} />
                          {isPending ? "Working…" : "Unsubscribe"}
                        </button>
                        <button
                          onClick={() => handleAction("ignore", card.id)}
                          disabled={isPending}
                          title="Ignore"
                          aria-label="Ignore"
                          className="flex items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>

                      {!card.hasUnsubscribe && (
                        <p className="mt-2 text-[11px] text-muted">No unsubscribe link found for this sender.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center">
                <ShieldCheck className="h-6 w-6 text-muted" strokeWidth={1.5} />
                <p className="text-sm text-muted">No suspected spam in your inbox today.</p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-2xl px-4 pb-6 text-xs text-muted">
        <Link href="/terms" target="_blank" className="hover:text-foreground">
          Terms of Service
        </Link>
        <span className="mx-2">·</span>
        <Link href="/privacy" target="_blank" className="hover:text-foreground">
          Privacy Policy
        </Link>
      </footer>

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmingDelete(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-delete-heading"
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-delete-heading" className="text-sm font-semibold">
              Delete this email?
            </h2>
            <p className="mt-2 text-sm text-muted">
              From <span className="font-medium text-foreground">{confirmingDelete.name}</span>:{" "}
              &ldquo;{confirmingDelete.subject}&rdquo;. This moves it to Gmail Trash.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                ref={cancelButtonRef}
                onClick={() => setConfirmingDelete(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                Cancel
              </button>
              <button
                ref={deleteButtonRef}
                onClick={() => {
                  handleAction("delete", confirmingDelete.id);
                  setConfirmingDelete(null);
                }}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-danger-foreground transition-colors hover:opacity-90"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4" role="status" aria-live="polite">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm shadow-lg">
            <CheckCircle2 className="h-4 w-4 text-accent" strokeWidth={2} />
            {successMessage}
          </div>
        </div>
      )}
    </div>
  );
}
