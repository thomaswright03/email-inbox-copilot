import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Providers from "@/components/Providers";
import { getTranslator } from "@/lib/i18n/server";
import { isTheme, THEME_COLORS, THEME_COOKIE, type Theme } from "@/lib/theme";
import "./globals.css";

async function savedTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : "system";
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("app.name"), description: t("app.description") };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await savedTheme();
  return {
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
          ]
        : THEME_COLORS[theme],
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Every page renders per request so it can carry the CSP nonce set in
  // proxy.ts (a statically prerendered page has no nonce and its scripts
  // would be blocked).
  await connection();
  const { locale } = await getTranslator();
  const theme = await savedTheme();
  return (
    <html
      lang={locale}
      data-theme={theme === "system" ? undefined : theme}
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-background text-foreground antialiased font-sans">
        <Providers locale={locale} theme={theme}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
