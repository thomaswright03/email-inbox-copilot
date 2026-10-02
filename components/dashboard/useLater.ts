"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { isDue, laterStorageKey, nextDueAt, parseLater, readStored, writeStored, type LaterEntry, type LaterMap } from "./later";

// Every useLater on the page (and other tabs, through the storage event)
// re-reads the entries when one of them writes.
const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function changed() {
  for (const listener of listeners) listener();
}

// setTimeout's longest delay; a later entry just wakes the page once more.
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

// The Snooze / Remind me entries for one account (components/dashboard/
// later.ts), and the current time, which moves forward whenever an entry
// comes due or the page comes back into view (focus, a visible tab).
// `onDue` is called once for each entry that has come due, to show a
// browser notification when the user allowed them; it returns false when
// it isn't ready yet (the entries are offered again on the next change).
export function useLater(accountId: string, onDue: (ids: string[]) => boolean) {
  const key = laterStorageKey(accountId);
  // Nothing on the server render: the entries live in this browser only.
  const raw = useSyncExternalStore(
    subscribe,
    () => readStored(key),
    () => null
  );
  const entries = useMemo(() => parseLater(raw), [raw]);
  const [now, setNow] = useState(() => Date.now());

  const update = useCallback(
    (change: (current: Record<string, LaterEntry>) => void) => {
      const next = { ...parseLater(readStored(key)) };
      change(next);
      writeStored(key, next);
      changed();
    },
    [key]
  );

  const set = useCallback(
    (id: string, entry: LaterEntry) => {
      update((current) => {
        current[id] = entry;
      });
      setNow(Date.now());
    },
    [update]
  );
  const remove = useCallback(
    (id: string) =>
      update((current) => {
        delete current[id];
      }),
    [update]
  );

  useEffect(() => {
    const next = nextDueAt(entries, now);
    if (next === null) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(Math.max(next - Date.now(), 0) + 50, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [entries, now]);

  useEffect(() => {
    const wake = () => setNow(Date.now());
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);

  useEffect(() => {
    const due = Object.entries(entries).flatMap(([id, e]) => (isDue(e, now) && !e.notified ? [id] : []));
    if (due.length === 0 || !onDue(due)) return;
    update((current) => {
      for (const id of due) if (current[id]) current[id] = { ...current[id], notified: true };
    });
  }, [entries, now, onDue, update]);

  return { entries: entries as LaterMap, now, set, remove };
}
