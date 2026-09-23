"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Inbox, LogOut, MailX, ShieldAlert, ShieldCheck, Sparkles, Trash2, EyeOff, AlertTriangle } from "lucide-react";

type TodayResponse = {
  summary: string;
  count: number;
  emails: { id: string; from: string; subject: string; snippet: string; date: string }[];
};

type SpamCard = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  hasUnsubscribe: boolean;
  reason: string;
};

type Tab = "summary" | "spam";

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
    <div className="grid gap-3 sm:grid-cols-2">
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

export default function Dashboard({ userName }: { userName: string }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [spamCards, setSpamCards] = useState<SpamCard[] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSpam, setLoadingSpam] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/emails/today")
      .then((r) => r.json())
      .then(setToday)
      .finally(() => setLoadingSummary(false));

    fetch("/api/emails/spam")
      .then((r) => r.json())
      .then((data) => setSpamCards(data.flashcards))
      .finally(() => setLoadingSpam(false));
  }, []);

  async function handleAction(action: "delete" | "unsubscribe" | "ignore", messageId: string) {
    setActionError(null);
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
    setRemovingIds((prev) => new Set(prev).add(messageId));
    setTimeout(() => {
      setSpamCards((prev) => prev?.filter((c) => c.id !== messageId) ?? null);
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }, 180);
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
            {!loadingSummary && (
              <div className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted">
                <Inbox className="h-3.5 w-3.5" strokeWidth={2} />
                {today?.count ?? 0} messages today
              </div>
            )}

            <div className="rounded-2xl border border-border bg-surface p-5">
              {loadingSummary ? (
                <SkeletonLines />
              ) : (
                <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-headings:text-sm prose-headings:font-semibold prose-p:leading-relaxed prose-li:my-0.5">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{today?.summary ?? ""}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "spam" && (
          <div>
            {actionError && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2} />
                {actionError}
              </div>
            )}

            {loadingSpam ? (
              <SkeletonCards />
            ) : spamCards && spamCards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {spamCards.map((card) => {
                  const { name, email } = parseSender(card.from);
                  const isRemoving = removingIds.has(card.id);
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

                      {card.reason && (
                        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
                          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                          {card.reason}
                        </div>
                      )}

                      <div className="mt-3.5 flex gap-2">
                        <button
                          onClick={() => handleAction("delete", card.id)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-danger-soft px-2.5 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger hover:text-danger-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                          Delete
                        </button>
                        <button
                          onClick={() => handleAction("unsubscribe", card.id)}
                          disabled={!card.hasUnsubscribe}
                          title={card.hasUnsubscribe ? undefined : "No unsubscribe link found"}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:bg-surface-hover disabled:text-muted disabled:hover:bg-surface-hover disabled:hover:text-muted"
                        >
                          <MailX className="h-3.5 w-3.5" strokeWidth={2} />
                          Unsubscribe
                        </button>
                        <button
                          onClick={() => handleAction("ignore", card.id)}
                          title="Ignore"
                          aria-label="Ignore"
                          className="flex items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                        >
                          <EyeOff className="h-3.5 w-3.5" strokeWidth={2} />
                        </button>
                      </div>
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
    </div>
  );
}
