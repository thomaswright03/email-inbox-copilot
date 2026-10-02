"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { fetchJson } from "@/lib/client-fetch";
import { parseSender } from "@/lib/sender";
import type { BriefingItem } from "@/lib/ai";
import type { ActionName, ActionResult, SpamCardPayload, TodayPayload } from "@/lib/payloads";
import { useI18n } from "../I18nProvider";
import DashboardHeader from "./DashboardHeader";
import DataFooter from "./DataFooter";
import Tabs, { panelId, tabId, type Tab } from "./Tabs";
import SummaryPanel from "./SummaryPanel";
import SpamCard, { type CardAction, type CardNotice } from "./SpamCard";
import ConfirmDialog from "./ConfirmDialog";
import Toast, { type ToastState } from "./Toast";
import { ErrorState, recoveryFor, SkeletonCards, SlowNotice } from "./States";
import { errorMessageKey } from "./errors";
import { formatResetTime } from "./format";
import { useInbox } from "./useInbox";
import { useLater } from "./useLater";
import { laterTime, type LaterChoice, type LaterKind } from "./later";

type ActionResponse = Extract<ActionResult, { ok: true }>;

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
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { t, locale } = useI18n();
  const inbox = useInbox(locale);
  const { cards, setCards } = inbox;

  // The tab lives in the URL (?tab=spam), and each switch is a history
  // entry, so Back returns to the previous tab before it leaves the app.
  // Local state answers a click at once; when the URL changes on its own
  // (Back/Forward), the tab follows it.
  const urlTab: Tab = searchParams.get("tab") === "spam" ? "spam" : "summary";
  const [tab, setTabState] = useState<Tab>(urlTab);
  const [seenUrlTab, setSeenUrlTab] = useState<Tab>(urlTab);
  if (urlTab !== seenUrlTab) {
    setSeenUrlTab(urlTab);
    setTabState(urlTab);
  }
  const [pending, setPending] = useState<{ id: string; action: CardAction } | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [notices, setNotices] = useState<Record<string, CardNotice>>({});
  const [confirming, setConfirming] = useState<SpamCardPayload | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  // Briefing items marked Done (archived) since the summary last loaded;
  // a new load starts from what the server says.
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const [donePending, setDonePending] = useState<string | null>(null);
  const [seenToday, setSeenToday] = useState(inbox.today);
  if (inbox.today !== seenToday) {
    setSeenToday(inbox.today);
    setDoneIds(new Set());
  }

  function setTab(next: Tab) {
    if (next === tab) return;
    setTabState(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "summary") params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    // Next.js syncs useSearchParams with the native History API.
    window.history.pushState(null, "", query ? `/?${query}` : "/");
  }

  useEffect(() => {
    // The Google access token couldn't be refreshed (e.g. the refresh token
    // was revoked): the session is no longer usable, so sign out cleanly.
    if (session?.error === "RefreshAccessTokenError") void signOut();
  }, [session?.error]);

  // Snooze and Remind me (components/dashboard/later.ts). When one comes
  // due, a browser notification is shown if the user allowed them; the
  // dashboard highlights it either way. The notification is generic: it
  // never names the sender or subject, because the operating system can show
  // it on a lock screen and keep it in its notification history, outside
  // Inbox Buddy (Privacy Policy section 3). The dashboard shows which email.
  const notifyDue = useCallback(
    (ids: string[]) => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return true;
      for (const id of ids) {
        try {
          new Notification(t("later.notificationTitle"), {
            body: t("later.notificationBody"),
            tag: `inbox-buddy-${id}`,
          });
        } catch {
          // Some browsers only allow notifications from a service worker;
          // the in-page highlight still shows.
        }
      }
      return true;
    },
    [t]
  );
  const later = useLater(accountId, notifyDue);

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

  async function runAction(action: CardAction, card: SpamCardPayload) {
    setNotice(card.id, null);
    setPending({ id: card.id, action });
    try {
      const result = await postAction(action, card.id);
      if (!result.ok && result.code === "message_gone") {
        // Deleted or moved in Gmail since the list loaded: no retry can
        // help, so the card goes and the list is reloaded.
        removeCard(card);
        showToast({ tone: "warning", message: t("errors.message_gone") });
        void inbox.refresh();
        return;
      }
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
      setPending(null);
    }
  }

  function setDone(id: string, done: boolean) {
    setDoneIds((prev) => {
      const next = new Set(prev);
      if (done) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  // Done archives the message; Undo moves it back to the inbox.
  async function markDone(item: BriefingItem, email: TodayPayload["emails"][number]) {
    setDonePending(item.id);
    try {
      const result = await postAction("done", item.id);
      if (!result.ok && result.code === "message_gone") {
        setDone(item.id, true);
        showToast({ tone: "warning", message: t("errors.message_gone") });
        void inbox.refresh();
        return;
      }
      if (!result.ok) {
        showToast({ tone: "warning", message: t(errorMessageKey(result.code, "errors.action")) });
        return;
      }
      setDone(item.id, true);
      later.remove(item.id);
      showToast({
        tone: "success",
        message: t("toast.done", { subject: email.subject }),
        onUndo: async () => {
          setToast(null);
          const undone = await postAction("undo_archive", item.id);
          if (!undone.ok) {
            showToast({ tone: "warning", message: t("toast.undoFailed") });
            return;
          }
          setDone(item.id, false);
          showToast({ tone: "success", message: t("toast.undone") });
        },
      });
    } finally {
      setDonePending(null);
    }
  }

  // Snooze hides the item in this browser until the chosen time (Gmail's
  // API has no snooze; the server only records that it was used). Remind me
  // keeps it where it is and asks, once, to show a notification then.
  function setLater(item: BriefingItem, email: TodayPayload["emails"][number], kind: LaterKind, choice: LaterChoice) {
    const until = laterTime(choice);
    later.set(item.id, { kind, until, threadId: email.threadId });
    if (kind === "snooze") void postAction("snooze", item.id);
    else if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        void Notification.requestPermission().catch(() => {});
      } catch {
        // Older browsers take a callback instead; the in-page highlight is enough.
      }
    }
    const time = new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(until);
    showToast({
      tone: "success",
      message: t(kind === "snooze" ? "toast.snoozed" : "toast.reminder", { subject: email.subject, time }),
      onUndo: () => {
        later.remove(item.id);
        showToast({ tone: "success", message: t("toast.undone") });
      },
    });
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
              doneIds={doneIds}
              pendingId={donePending}
              onDone={(item, email) => void markDone(item, email)}
              later={later}
              onLater={setLater}
              onDismissDue={later.remove}
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
                <p className="mb-3 text-sm text-muted">
                  {t(`spam.ai.${inbox.spam.data.aiStatus}`, { time: resetTime(inbox.spam.data.aiResetsAt) })}
                </p>
              )}
              {cards.length > 0 ? (
                <div className="grid grid-cols-1 gap-3">
                  {cards.map((card) => (
                    <SpamCard
                      key={card.id}
                      card={card}
                      accountEmail={userEmail}
                      pending={pending?.id === card.id}
                      pendingAction={pending?.id === card.id ? pending.action : null}
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
