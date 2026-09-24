"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { createTranslator, MESSAGES, type Translate } from "@/lib/i18n";

type I18n = { locale: Locale; t: Translate; setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18n | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const t = useMemo(() => createTranslator(locale, MESSAGES[locale]), [locale]);
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
      document.documentElement.lang = next;
      // Server components (and <html lang>) re-render in the new language.
      router.refresh();
    },
    [router]
  );
  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
