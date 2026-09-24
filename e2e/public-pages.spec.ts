import { expect, test, type Page } from "@playwright/test";
import { CONTACT_EMAIL } from "../content/legal";
import { signInAs } from "./session";

// Collects everything that would show up as a problem in the browser
// console: uncaught errors, console errors, and CSP violations.
function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`console: ${msg.text()}`);
  });
  return problems;
}

test.describe("sign-in and error pages", () => {
  test("the sign-in page explains the product and links the legal documents", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Inbox Buddy" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
    expect(problems).toEqual([]);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`a denied sign-in lands on the branded page (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const problems = watchConsole(page);
      // Auth.js sends failed sign-ins to its error endpoint, which
      // redirects to the app's own page (auth.ts `pages.error`).
      await page.goto("/api/auth/error?error=AccessDenied");
      await expect(page).toHaveURL(/\/auth\/error\?error=AccessDenied/);
      await expect(page.getByRole("heading", { name: "This Google account can't use Inbox Buddy" })).toBeVisible();
      await expect(page.getByText(/invite-only/)).toBeVisible();
      await expect(page.getByText(`Questions? Contact ${CONTACT_EMAIL}.`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Try a different Google account" })).toBeVisible();
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).toBe(scheme === "dark" ? "rgb(9, 9, 11)" : "rgb(250, 250, 250)");
      expect(problems).toEqual([]);
    });
  }

  for (const [error, heading] of [
    ["Configuration", "Sign-in isn't working right now"],
    ["Verification", "That sign-in link has expired"],
  ] as const) {
    test(`the ${error} error has its own explanation`, async ({ page }) => {
      const problems = watchConsole(page);
      await page.goto(`/auth/error?error=${error}`);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(problems).toEqual([]);
    });
  }

  test("an unknown page shows the branded 404", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page).toHaveTitle("Page not found · Inbox Buddy");
    await page.getByRole("link", { name: "Back to Inbox Buddy" }).click();
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  });
});

test.describe("preferences", () => {
  test("Spanish is remembered across reloads and translates every screen", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Language").selectOption("es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();

    await page.goto("/no-such-page");
    await expect(page.getByRole("heading", { name: "Página no encontrada" })).toBeVisible();
    await page.goto("/auth/error?error=AccessDenied");
    await expect(page.getByRole("button", { name: "Probar con otra cuenta de Google" })).toBeVisible();
    await page.goto("/privacy");
    await expect(page.getByText("Este documento solo está disponible en inglés.")).toBeVisible();
  });

  test("the language defaults from the browser", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await context.close();
  });

  test("a chosen Dark theme is applied from the first byte, and System follows the OS again", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // The server renders the attribute itself, so there is no flash of
    // the light theme before scripts run.
    const cookies = await page.context().cookies();
    const theme = cookies.find((c) => c.name === "theme");
    expect(theme?.value).toBe("dark");
    const html = await (await request.get("/", { headers: { cookie: "theme=dark" } })).text();
    expect(html).toMatch(/<html[^>]*data-theme="dark"/);
    expect(html).toContain('name="theme-color" content="#09090b"');

    await page.reload();
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(9, 9, 11)");

    await page.getByRole("radio", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe("rgb(250, 250, 250)");
  });
});

test.describe("consent", () => {
  test("without a database, the consent screen says the service isn't set up instead of 'try again'", async ({ page, context }) => {
    await signInAs(context, { consented: false });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Before you continue" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "isn't fully set up yet" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: CONTACT_EMAIL })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agree & Continue" })).toHaveCount(0);
  });
});
