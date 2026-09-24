"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client-fetch";
import type { Locale } from "@/lib/i18n/config";
import type { SpamCardPayload, SpamPayload, TodayPayload } from "@/lib/payloads";

export type LoadState<T> = { status: "loading" } | { status: "error"; code: string } | { status: "ready"; data: T };

// Loads the summary and spam list, and reloads them on demand (Refresh
// bypasses the server cache) or when the language changes (the AI summary
// is written in the user's language).
export function useInbox(locale: Locale) {
  const [today, setToday] = useState<LoadState<TodayPayload>>({ status: "loading" });
  const [spam, setSpam] = useState<LoadState<SpamPayload>>({ status: "loading" });
  const [cards, setCards] = useState<SpamCardPayload[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef({ today: 0, spam: 0 });

  const loadToday = useCallback(
    async (refresh = false) => {
      const run = ++latest.current.today;
      const query = new URLSearchParams({ lang: locale, ...(refresh ? { refresh: "1" } : {}) });
      const result = await fetchJson<TodayPayload>(`/api/emails/today?${query}`);
      if (run !== latest.current.today) return;
      setToday(result.ok ? { status: "ready", data: result.data } : { status: "error", code: result.code });
    },
    [locale]
  );

  const loadSpam = useCallback(async (refresh = false) => {
    const run = ++latest.current.spam;
    const result = await fetchJson<SpamPayload>(`/api/emails/spam${refresh ? "?refresh=1" : ""}`);
    if (run !== latest.current.spam) return;
    if (result.ok) {
      setSpam({ status: "ready", data: result.data });
      setCards(result.data.flashcards);
    } else {
      setSpam({ status: "error", code: result.code });
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount (and when the language changes); state is only set
    // after the request settles.
    void loadToday();
  }, [loadToday]);

  useEffect(() => {
    // setState runs only after the request settles, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSpam();
  }, [loadSpam]);

  const retryToday = useCallback(() => {
    setToday({ status: "loading" });
    void loadToday();
  }, [loadToday]);

  const retrySpam = useCallback(() => {
    setSpam({ status: "loading" });
    void loadSpam();
  }, [loadSpam]);

  // Refresh keeps the current content on screen until the new one arrives.
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadToday(true), loadSpam(true)]);
    setRefreshing(false);
  }, [loadToday, loadSpam]);

  // Asks the server to check the next batch of possible spam with AI (the
  // ones already checked are cached there), keeping the list on screen.
  const [checkingSpam, setCheckingSpam] = useState(false);
  const checkMoreSpam = useCallback(async () => {
    setCheckingSpam(true);
    await loadSpam(true);
    setCheckingSpam(false);
  }, [loadSpam]);

  return { today, spam, cards, setCards, refreshing, refresh, retryToday, retrySpam, checkingSpam, checkMoreSpam };
}
