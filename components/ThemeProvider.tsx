"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { THEME_COLORS, THEME_COOKIE, type Theme } from "@/lib/theme";

type ThemeState = { theme: Theme; setTheme: (theme: Theme) => void };

const ThemeContext = createContext<ThemeState | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  // Browser UI colour: a fixed colour for an explicit choice, or one per
  // colour scheme (media queries) for System.
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.remove());
  const entries: [string, string | null][] =
    theme === "system"
      ? [
          [THEME_COLORS.light, "(prefers-color-scheme: light)"],
          [THEME_COLORS.dark, "(prefers-color-scheme: dark)"],
        ]
      : [[THEME_COLORS[theme], null]];
  for (const [color, media] of entries) {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = color;
    if (media) meta.media = media;
    document.head.appendChild(meta);
  }
}

export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const setTheme = useCallback((next: Theme) => {
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
    applyTheme(next);
    setThemeState(next);
  }, []);
  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
