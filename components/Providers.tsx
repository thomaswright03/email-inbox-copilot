"use client";

import { SessionProvider } from "next-auth/react";
import type { Locale } from "@/lib/i18n/config";
import type { Theme } from "@/lib/theme";
import { I18nProvider } from "./I18nProvider";
import { ThemeProvider } from "./ThemeProvider";

export default function Providers({
  locale,
  theme,
  children,
}: {
  locale: Locale;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <I18nProvider locale={locale}>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </I18nProvider>
    </SessionProvider>
  );
}
