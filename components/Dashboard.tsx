"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

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

export default function Dashboard({ userName }: { userName: string }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [spamCards, setSpamCards] = useState<SpamCard[] | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSpam, setLoadingSpam] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

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
    setSpamCards((prev) => prev?.filter((c) => c.id !== messageId) ?? null);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inbox Copilot</h1>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <span>{userName}</span>
          <button onClick={() => signOut()} className="underline hover:text-neutral-900">
            Sign out
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-2 border-b border-neutral-200">
        <button
          onClick={() => setTab("summary")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "summary" ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500"
          }`}
        >
          Today&apos;s Summary
        </button>
        <button
          onClick={() => setTab("spam")}
          className={`px-3 py-2 text-sm font-medium ${
            tab === "spam" ? "border-b-2 border-neutral-900 text-neutral-900" : "text-neutral-500"
          }`}
        >
          Spam Flashcards{spamCards ? ` (${spamCards.length})` : ""}
        </button>
      </div>

      {tab === "summary" && (
        <div>
          {loadingSummary ? (
            <p className="text-neutral-500">Scanning today&apos;s inbox…</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-neutral-500">{today?.count ?? 0} messages today</p>
              <div className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-4 text-sm leading-relaxed">
                {today?.summary}
              </div>
            </>
          )}
        </div>
      )}

      {tab === "spam" && (
        <div>
          {actionError && (
            <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
          )}
          {loadingSpam ? (
            <p className="text-neutral-500">Checking for spam that slipped into your inbox…</p>
          ) : spamCards && spamCards.length > 0 ? (
            <div className="grid gap-3">
              {spamCards.map((card) => (
                <div key={card.id} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <p className="font-medium">{card.from}</p>
                  <p className="text-sm text-neutral-700">{card.subject}</p>
                  <p className="mt-1 text-xs text-neutral-500">{card.snippet}</p>
                  {card.reason && <p className="mt-2 text-xs italic text-neutral-400">{card.reason}</p>}
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleAction("delete", card.id)}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-500"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => handleAction("unsubscribe", card.id)}
                      disabled={!card.hasUnsubscribe}
                      className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      Unsubscribe
                    </button>
                    <button
                      onClick={() => handleAction("ignore", card.id)}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500">No suspected spam in your inbox today. Nice and clean.</p>
          )}
        </div>
      )}
    </div>
  );
}
