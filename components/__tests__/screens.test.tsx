// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }));
vi.mock("next-auth/react", () => ({ useSession: vi.fn(), signOut: vi.fn(), signIn: vi.fn() }));

import { signIn, signOut, useSession } from "next-auth/react";
import ConsentGate from "../ConsentGate";
import SignIn from "../SignIn";
import Preferences, { PreferencesMenu } from "../Preferences";
import { useI18n } from "../I18nProvider";
import { useTheme } from "../ThemeProvider";
import GlobalError from "@/app/error";
import AuthErrorActions from "@/app/auth/error/AuthErrorActions";
import { LEGAL_VERSION, CONTACT_EMAIL } from "@/content/legal";
import { renderWithProviders } from "./test-utils";
import { render } from "@testing-library/react";

function mockUpdate(result: unknown) {
  const update = vi.fn(async () => result);
  vi.mocked(useSession).mockReturnValue({ update } as unknown as ReturnType<typeof useSession>);
  return update;
}

function clearCookies() {
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  }
}

describe("ConsentGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records agreement to the current terms and continues to the inbox", async () => {
    const update = mockUpdate({ legalVersionAccepted: LEGAL_VERSION });
    renderWithProviders(<ConsentGate storageReady />);
    const agree = screen.getByRole("button", { name: "Agree & Continue" });
    expect(agree.hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(agree));
    expect(update).toHaveBeenCalledWith({ legalVersionAccepted: LEGAL_VERSION });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("asks the user to try again when the agreement couldn't be stored", async () => {
    mockUpdate({ legalVersionAccepted: undefined });
    renderWithProviders(<ConsentGate storageReady />);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Agree & Continue" })));
    expect(screen.getByRole("alert").textContent).toBe("We couldn't save your agreement. Please try again in a moment.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("says the service isn't set up (not 'try again') when agreements can't be stored at all", () => {
    mockUpdate(null);
    renderWithProviders(<ConsentGate storageReady={false} />);
    expect(screen.getByRole("alert").textContent).toContain("isn't fully set up yet");
    expect(screen.getByRole("alert").textContent).toContain(CONTACT_EMAIL);
    expect(screen.queryByRole("button", { name: "Agree & Continue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Not now, sign out instead" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("is shown in the chosen language", () => {
    mockUpdate(null);
    renderWithProviders(<ConsentGate storageReady />, { locale: "es" });
    expect(screen.getByRole("heading").textContent).toBe("Antes de continuar");
  });
});

describe("SignIn", () => {
  it("signs in with Google and links the legal documents", () => {
    renderWithProviders(<SignIn />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(signIn).toHaveBeenCalledWith("google");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  });
});

describe("Preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCookies();
    delete document.documentElement.dataset.theme;
  });

  it("switches the theme at once, remembers it, and themes the browser UI", () => {
    renderWithProviders(<Preferences />);
    const dark = screen.getByRole("radio", { name: "Dark" });
    fireEvent.click(dark);
    expect(dark.getAttribute("aria-checked")).toBe("true");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain("theme=dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#09090b");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.querySelectorAll('meta[name="theme-color"][media]')).toHaveLength(2);
  });

  it("switches the language, remembers it, and re-renders the server parts", () => {
    renderWithProviders(<Preferences />);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "fr" } });
    expect(document.cookie).toContain("lang=fr");
    expect(document.documentElement.lang).toBe("fr");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("the header menu opens, says the legal documents are English only, and closes on Escape or outside click", () => {
    renderWithProviders(<PreferencesMenu />);
    const button = screen.getByRole("button", { name: "EN: Language / Theme" });
    expect(button.textContent).toBe("en");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("The Terms and Privacy Policy are available in English only.")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("the providers refuse to be used outside the app shell", () => {
    function UsesI18n() {
      useI18n();
      return null;
    }
    function UsesTheme() {
      useTheme();
      return null;
    }
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<UsesI18n />)).toThrow(/I18nProvider/);
    expect(() => render(<UsesTheme />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});

describe("error screens", () => {
  it("the app error page offers Try again and a way home", () => {
    const reset = vi.fn();
    renderWithProviders(<GlobalError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("boom");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
  });

  it("a denied sign-in offers Google's account chooser", () => {
    render(<AuthErrorActions primaryLabel="Try a different Google account" chooseAccount />);
    fireEvent.click(screen.getByRole("button", { name: "Try a different Google account" }));
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/" }, { prompt: "select_account consent" });
  });

  it("other sign-in errors simply try again", () => {
    render(<AuthErrorActions primaryLabel="Try again" chooseAccount={false} />);
    fireEvent.click(within(document.body).getByRole("button", { name: "Try again" }));
    expect(signIn).toHaveBeenLastCalledWith("google", { redirectTo: "/" }, undefined);
  });
});
