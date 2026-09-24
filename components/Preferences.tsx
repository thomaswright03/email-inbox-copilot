"use client";

import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Settings2, Sun } from "lucide-react";
import { LOCALE_NAMES, LOCALES, isLocale } from "@/lib/i18n/config";
import { THEMES, type Theme } from "@/lib/theme";
import { useI18n } from "./I18nProvider";
import { useTheme } from "./ThemeProvider";

const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

// Language menu and Light / Dark / System switch, shown on every screen.
export default function Preferences({ className = "" }: { className?: string }) {
  const { locale, t, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="sr-only" htmlFor="language-select">
        {t("prefs.language")}
      </label>
      <select
        id="language-select"
        value={locale}
        onChange={(e) => isLocale(e.target.value) && setLocale(e.target.value)}
        title={locale === "en" ? t("prefs.language") : `${t("prefs.language")}. ${t("prefs.legalEnglishOnly")}`}
        className="tap-h rounded-lg border border-border bg-surface px-2 text-sm text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>

      <div role="radiogroup" aria-label={t("prefs.theme")} className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {THEMES.map((option) => {
          const Icon = THEME_ICON[option];
          const selected = theme === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t(`prefs.theme.${option}`)}
              title={t(`prefs.theme.${option}`)}
              onClick={() => setTheme(option)}
              className={`tap-target flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                selected ? "bg-surface-hover text-foreground" : "text-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The same controls behind one button, for the crowded dashboard header.
export function PreferencesMenu() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = `${t("prefs.language")} / ${t("prefs.theme")}`;
  // The visible language code starts the accessible name too.
  const name = `${locale.toUpperCase()}: ${label}`;
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="preferences-panel"
        aria-label={name}
        title={label}
        className="tap-h flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
      >
        <Settings2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        {/* The current language, visible without hovering, so someone who
            lands in the wrong one can find the switch. */}
        <span className="text-xs font-semibold uppercase tracking-wide">
          {locale}
        </span>
      </button>
      {open && (
        <div
          id="preferences-panel"
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-3 shadow-lg"
        >
          <Preferences className="flex-wrap" />
          <p className="mt-2 text-xs text-muted">{t("prefs.legalEnglishOnly")}</p>
        </div>
      )}
    </div>
  );
}
