"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { fetchJson } from "@/lib/client-fetch";
import { parseSender } from "@/lib/sender";
import type { ActionName, SpamCardPayload } from "@/lib/payloads";
import { useI18n } from "../I18nProvider";
import DashboardHeader from "./DashboardHeader";
import DataFooter from "./DataFooter";
import Tabs, { panelId, tabId, type Tab } from "./Tabs";
import SummaryPanel from "./SummaryPanel";
import SpamCard, { type CardNotice } from "./SpamCard";
import ConfirmDialog from "./ConfirmDialog";
import Toast, { type ToastState } from "./Toast";
import { ErrorState, recoveryFor, SkeletonCards, SlowNotice } from "./States";
import { errorMessageKey } from "./errors";
import { formatResetTime } from "./format";
import { useInbox } from "./useInbox";

type ActionResponse = { ok: true; archived?: boolean; warning?: string };

const REMOVE_ANIMATION_MS = 180;

function postAction(action: ActionName, messageId: string) {
  return fetchJson<ActionResponse>("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, messageId }),
  });
}

export default function Dashboard({
  userName,
  userEmail,
  accountId,
  dataRequestCode,
  aiOn,
}: {
  userName: string;
  userEmail: string;
  accountId: string;
  dataRequestCode: string | null;
  // AI features are enabled on this deployment (lib/ai.ts aiEnabled). When
  // they are off, the first tab is a rule-sorted list, so it isn't called a
  // summary.
  aiOn: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const inbox = useInbox(locale);
  const { cards, setCards } = inbox;

  const [tab, setTabState] = useState<Tab>(searchParams.get("tab") === "spam" ? "spam" : "summary");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Record<string, CardNotice>>({});
  const [confirming, setConfirming] = useState<SpamCardPayload | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  function setTab(next: Tab) {
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "summary") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    router.replace(query ? `/?${query}` : "/", { scroll: false });
  }

  useEffect(() => {
    // The Google access token couldn't be refreshed (e.g. the refresh token
    // was revoked): the session is no longer usable, so sign out cleanly.
    if (session?.error === "RefreshAccessTokenError") void signOut();
  }, [session?.error]);

  const dismissToast = useCallback(() => setToast(null), []);
  const closeConfirm = useCallback(() => setConfirming(null), []);
  const showToast = useCallback((next: Omit<ToastState, "id">) => setToast({ ...next, id: Date.now() }), []);

  function setNotice(id: string, notice: CardNotice | null) {
    setNotices((prev) => {
      const next = { ...prev };
      if (notice) next[id] = notice;
      else delete next[id];
      return next;
    });
  }

  // Animates the card out, then removes it; returns where it was so Undo
  // can put it back in the same place.
  function removeCard(card: SpamCardPayload): number {
    const index = cards.findIndex((c) => c.id === card.id);
    setRemovingIds((prev) => new Set(prev).add(card.id));
    setTimeout(() => {
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setRemovingIds((prev) => {
        const next = new Set(prev);
        next.delete(card.id);
        return next;
      });
    }, REMOVE_ANIMATION_MS);
    return index;
  }

  async function undo(action: ActionName, card: SpamCardPayload, index: number) {
    setToast(null);
    const result = await postAction(action, card.id);
    if (!result.ok) {
      showToast({ tone: "warning", message: t("toast.undoFailed") });
      return;
    }
    setCards((prev) => {
      if (prev.some((c) => c.id === card.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, card);
      return next;
    });
    showToast({ tone: "success", message: t("toast.undone") });
  }

  async function runAction(action: "delete" | "unsubscribe" | "ignore", card: SpamCardPayload) {
    setNotice(card.id, null);
    setPendingId(card.id);
    try {
      const result = await postAction(action, card.id);
      if (!result.ok) {
        setNotice(card.id, {
          kind: "error",
          message: t(errorMessageKey(result.code, "errors.action")),
          recovery: recoveryFor(result.code),
        });
        return;
      }
      const index = removeCard(card);
      const { name } = parseSender(card.from);
      if (action === "delete") {
        showToast({
          tone: "success",
          message: t("toast.deleted", { subject: card.subject }),
          onUndo: () => void undo("undo_delete", card, index),
        });
      } else if (action === "ignore") {
        showToast({
          tone: "success",
          message: t("toast.notSpam", { subject: card.subject }),
          onUndo: () => void undo("undo_ignore", card, index),
        });
      } else if (result.data.archived) {
        // The unsubscribe itself can't be undone; Undo moves the message
        // back to the inbox.
        showToast({
          tone: "success",
          message: t("toast.unsubscribed", { name }),
          onUndo: () => void undo("undo_archive", card, index),
        });
      } else {
        showToast({ tone: "warning", message: t("toast.unsubscribedNotArchived", { name }) });
      }
    } finally {
      setPendingId(null);
    }
  }

  const spamCount = inbox.spam.status === "ready" ? cards.length : null;
  const resetTime = (iso: string | undefined) => (iso ? formatResetTime(iso, locale) : "");

  return (
    <div className="min-h-screen">
      <DashboardHeader userName={userName} />

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Tabs tab={tab} spamCount={spamCount} onChange={setTab} summaryLabel={aiOn ? "tabs.summary" : "tabs.today"} />

        <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)}>
          {tab === "summary" ? (
            <SummaryPanel
              state={inbox.today}
              accountEmail={userEmail}
              refreshing={inbox.refreshing}
              onRefresh={() => void inbox.refresh()}
              onRetry={inbox.retryToday}
            />
          ) : inbox.spam.status === "error" ? (
            <ErrorState
              message={t(errorMessageKey(inbox.spam.code, "errors.spamLoad"))}
              code={inbox.spam.code}
              onRetry={inbox.retrySpam}
            />
          ) : inbox.spam.status === "loading" ? (
            <>
              <div aria-busy="true">
                <SkeletonCards />
              </div>
              <SlowNotice />
            </>
          ) : (
            <div>
              {/* The source caption describes the cards, so it is left out
                  when there are none (unless the AI budget ran out, which
                  the user needs to know either way). */}
              {(cards.length > 0 || inbox.spam.data.aiStatus === "budget") && (
                <p className="mb-3 text-xs text-muted">
                  {t(`spam.ai.${inbox.spam.data.aiStatus}`, { time: resetTime(inbox.spam.data.aiResetsAt) })}
                </p>
              )}
              {(inbox.spam.data.unchecked ?? 0) > 0 && (
                <div role="status" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
                  <span>
                    {inbox.spam.data.aiResetsAt
                      ? t("spam.uncheckedBudget", {
                          count: inbox.spam.data.unchecked ?? 0,
                          time: resetTime(inbox.spam.data.aiResetsAt),
                        })
                      : t("spam.unchecked", { count: inbox.spam.data.unchecked ?? 0 })}
                  </span>
                  {!inbox.spam.data.aiResetsAt && (
                    <button
                      onClick={() => void inbox.checkMoreSpam()}
                      disabled={inbox.checkingSpam}
                      className="tap-h inline-flex items-center rounded-lg border border-border bg-surface px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {inbox.checkingSpam ? t("spam.checking") : t("spam.checkMore")}
                    </button>
                  )}
                </div>
              )}
              {cards.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {cards.map((card) => (
                    <SpamCard
                      key={card.id}
                      card={card}
                      accountEmail={userEmail}
                      pending={pendingId === card.id}
                      removing={removingIds.has(card.id)}
                      notice={notices[card.id] ?? null}
                      onDelete={() => setConfirming(card)}
                      onUnsubscribe={() => void runAction("unsubscribe", card)}
                      onOpenedUnsubscribe={(kind) =>
                        setNotice(card.id, {
                          kind: "finish",
                          message: t(kind === "link" ? "spam.finishOnSenderPage" : "spam.finishInGmail"),
                        })
                      }
                      onNotSpam={() => void runAction("ignore", card)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-14 text-center">
                  <ShieldCheck className="h-6 w-6 text-muted" strokeWidth={1.5} aria-hidden />
                  <p className="text-sm text-muted">{t("spam.empty")}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <DataFooter accountId={accountId} dataRequestCode={dataRequestCode} />

      {confirming && (
        <ConfirmDialog
          name={parseSender(confirming.from).name}
          subject={confirming.subject}
          onCancel={closeConfirm}
          onConfirm={() => {
            const card = confirming;
            setConfirming(null);
            void runAction("delete", card);
          }}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
