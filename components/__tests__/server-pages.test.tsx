// @vitest-environment jsdom
// Server components are async functions: each is awaited and its output
// rendered inside the app's providers.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("next-auth/react", () => ({ useSession: vi.fn(() => ({ data: null })), signOut: vi.fn(), signIn: vi.fn() }));

const cookieJar = new Map<string, string>();
const headerJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined) }),
  headers: async () => ({ get: (name: string) => headerJar.get(name) ?? null }),
}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection: async () => {} }));
vi.mock("@/lib/session", () => ({ getGoogleSession: vi.fn() }));
vi.mock("geist/font/sans", () => ({ GeistSans: { variable: "font-sans-var" } }));
vi.mock("geist/font/mono", () => ({ GeistMono: { variable: "font-mono-var" } }));

import { getGoogleSession } from "@/lib/session";
import AuthErrorPage, { generateMetadata as authErrorMetadata } from "@/app/auth/error/page";
import NotFound from "@/app/not-found";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import Home from "@/app/page";
import RootLayout, { generateMetadata, generateViewport } from "@/app/layout";
import SignIn from "@/components/SignIn";
import ConsentGate from "@/components/ConsentGate";
import Dashboard from "@/components/dashboard/Dashboard";
import { CONTACT_EMAIL } from "@/content/legal";
import { renderWithProviders } from "./test-utils";
import type { ReactElement } from "react";

async function renderPage(page: Promise<ReactElement> | ReactElement, locale: "en" | "es" | "fr" = "en") {
  const element = await page;
  // Nested async server components (LegalDocument) are awaited too.
  const resolved =
    typeof element.type === "function" && element.type.constructor.name === "AsyncFunction"
      ? await (element.type as (p: unknown) => Promise<ReactElement>)(element.props)
      : element;
  return renderWithProviders(resolved, { locale });
}

describe("server-rendered pages", () => {
  beforeEach(() => {
    cookieJar.clear();
    headerJar.clear();
    vi.mocked(getGoogleSession).mockReset();
  });

  it.each([
    ["AccessDenied", "This Google account can't use Inbox Buddy", /invite-only/, "Try a different Google account"],
    ["Configuration", "Sign-in isn't working right now", /problem on our side/, "Try again"],
    ["Verification", "That sign-in link has expired", /no longer valid/, "Try again"],
    ["SomethingElse", "Sign-in didn't work", /Something went wrong/, "Try again"],
  ])("the sign-in error page explains %s and names a contact", async (error, title, body, action) => {
    await renderPage(AuthErrorPage({ searchParams: Promise.resolve({ error }) }));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.getByText(`Questions? Contact ${CONTACT_EMAIL}.`)).toBeTruthy();
    expect(screen.getByRole("button", { name: action })).toBeTruthy();
  });

  it("the sign-in error page follows the saved language", async () => {
    cookieJar.set("lang", "fr");
    await renderPage(AuthErrorPage({ searchParams: Promise.resolve({ error: "AccessDenied" }) }), "fr");
    expect(screen.getByRole("heading", { level: 1 }).textContent).not.toBe("This Google account can't use Inbox Buddy");
    expect((await authErrorMetadata()).title).toContain("Inbox Buddy");
  });

  it("the 404 page follows the browser language when nothing is saved", async () => {
    headerJar.set("accept-language", "es-MX,es;q=0.9,en;q=0.5");
    await renderPage(NotFound(), "es");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Página no encontrada");
  });

  it("legal pages say they are English only in other languages", async () => {
    cookieJar.set("lang", "es");
    await renderPage(PrivacyPage(), "es");
    expect(screen.getByText("Este documento solo está disponible en inglés.")).toBeTruthy();
    cookieJar.clear();
    await renderPage(TermsPage());
    expect(screen.getAllByRole("heading", { level: 1 }).some((h) => h.textContent === "Terms of Service")).toBe(true);
  });

  it("the home page shows sign-in, the consent gate, or the dashboard", async () => {
    vi.mocked(getGoogleSession).mockResolvedValue(null);
    expect((await Home()).type).toBe(SignIn);

    const session = { userId: "g1", userEmail: "a@example.com", userName: null, accessToken: "t", consented: false };
    vi.mocked(getGoogleSession).mockResolvedValue(session);
    const consent = await Home();
    expect(consent.type).toBe(ConsentGate);

    vi.mocked(getGoogleSession).mockResolvedValue({ ...session, consented: true });
    const dashboard = await Home();
    expect(dashboard.type).toBe(Dashboard);
    expect(dashboard.props.userName).toBe("a@example.com");
  });

  it("the layout sets <html lang> and the saved theme before first paint", async () => {
    cookieJar.set("lang", "fr");
    cookieJar.set("theme", "dark");
    const html = await RootLayout({ children: null });
    expect(html.props.lang).toBe("fr");
    expect(html.props["data-theme"]).toBe("dark");
    expect((await generateViewport()).themeColor).toBe("#09090b");
    expect((await generateMetadata()).title).toBe("Inbox Buddy");

    cookieJar.set("theme", "nonsense");
    expect((await RootLayout({ children: null })).props["data-theme"]).toBeUndefined();
    expect(Array.isArray((await generateViewport()).themeColor)).toBe(true);
  });
});
