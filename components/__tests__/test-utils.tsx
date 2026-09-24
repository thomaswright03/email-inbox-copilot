// Shared setup for component tests (jsdom). Next.js navigation and
// next-auth/react are replaced with spies in each test file via vi.mock;
// this file renders a component inside the app's own providers.
import { cleanup, render, type RenderResult } from "@testing-library/react";
import { afterEach } from "vitest";
import type { ReactElement } from "react";
import { I18nProvider } from "../I18nProvider";
import { ThemeProvider } from "../ThemeProvider";
import type { Locale } from "@/lib/i18n/config";
import type { Theme } from "@/lib/theme";

afterEach(() => cleanup());

export function renderWithProviders(ui: ReactElement, options: { locale?: Locale; theme?: Theme } = {}): RenderResult {
  return render(
    <I18nProvider locale={options.locale ?? "en"}>
      <ThemeProvider initialTheme={options.theme ?? "system"}>{ui}</ThemeProvider>
    </I18nProvider>
  );
}

// A fetch Response carrying JSON.
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// What a proxy or host sends when the app itself is unreachable.
export function htmlError(status = 502): Response {
  return new Response("<html><body><h1>502 Bad Gateway</h1></body></html>", {
    status,
    headers: { "Content-Type": "text/html" },
  });
}
