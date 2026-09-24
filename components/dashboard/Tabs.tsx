"use client";

import { useRef } from "react";
import { useI18n } from "../I18nProvider";

export type Tab = "summary" | "spam";
const TABS: Tab[] = ["summary", "spam"];

export function tabId(tab: Tab) {
  return `tab-${tab}`;
}
export function panelId(tab: Tab) {
  return `panel-${tab}`;
}

// WAI-ARIA tabs: the selected tab is announced, arrow keys (and Home/End)
// move between tabs, and only the selected tab is in the Tab order.
export default function Tabs({
  tab,
  spamCount,
  onChange,
  summaryLabel = "tabs.summary",
}: {
  tab: Tab;
  spamCount: number | null;
  onChange: (tab: Tab) => void;
  summaryLabel?: "tabs.summary" | "tabs.today";
}) {
  const { t } = useI18n();
  const refs = useRef<Record<Tab, HTMLButtonElement | null>>({ summary: null, spam: null });

  function onKeyDown(e: React.KeyboardEvent) {
    const index = TABS.indexOf(tab);
    let next: Tab | null = null;
    if (e.key === "ArrowRight") next = TABS[(index + 1) % TABS.length];
    else if (e.key === "ArrowLeft") next = TABS[(index - 1 + TABS.length) % TABS.length];
    else if (e.key === "Home") next = TABS[0];
    else if (e.key === "End") next = TABS[TABS.length - 1];
    if (!next) return;
    e.preventDefault();
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={t("tabs.label")}
      onKeyDown={onKeyDown}
      className="mb-6 inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1"
    >
      {TABS.map((name) => {
        const selected = tab === name;
        return (
          <button
            key={name}
            ref={(el) => {
              refs.current[name] = el;
            }}
            id={tabId(name)}
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(name)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(name)}
            className={`tap-h flex items-center gap-1.5 rounded-full px-3.5 text-sm font-medium transition-colors ${
              selected ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t(name === "summary" ? summaryLabel : "tabs.spam")}
            {name === "spam" && spamCount !== null && spamCount > 0 && (
              <>
                <span
                  aria-hidden
                  className="flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-soft px-1 text-[11px] font-semibold text-warning"
                >
                  {spamCount}
                </span>
                <span className="sr-only">, {t("tabs.spamCount", { count: spamCount })}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
