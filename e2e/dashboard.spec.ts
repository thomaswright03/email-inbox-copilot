import { expect, test, type Page } from "@playwright/test";
import { gmailChanges, signInAs } from "./session";

// The main flow against the production build: a signed-in user who has
// accepted the Terms reads the summary and works through the spam cards.
// Gmail is the stand-in in e2e/gmail-stub.mjs (Ana's contract email plus
// two bulk senders); AI is off, so the rule-based views are shown.

function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(err.message));
  return problems;
}

async function openSpamTab(page: Page) {
  await page.getByRole("tab", { name: /Spam Flashcards/ }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
}

const MEGADEALS = "MegaDeals: LIMITED TIME: 50% OFF EVERYTHING";
const TOOLS = "Tools Weekly: This week in tools";

test.describe("dashboard", () => {
  test("summary: count, freshness, Refresh, and a Gmail link for every message", async ({ page, context }) => {
    await signInAs(context);
    await page.goto("/");

    await expect(page.getByText("3 messages in the last 24 hours")).toBeVisible();
    await expect(page.getByText(/^Updated \d/)).toBeVisible();
    await expect(page.getByText(/AI features are off/)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Messages to check (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Likely promotional or bulk (2)" })).toBeVisible();
    const link = page.getByRole("link", { name: "Open “Contract review before Friday” in Gmail" });
    await expect(link).toHaveAttribute("href", /mail\.google\.com\/mail\/\?authuser=tester%40example\.com#all\/t1$/);

    const refreshed = page.waitForResponse((r) => r.url().includes("/api/emails/today?") && r.url().includes("refresh=1"));
    await page.getByRole("button", { name: "Refresh" }).click();
    expect((await refreshed).status()).toBe(200);
    await expect(page.getByRole("button", { name: "Refresh" })).toBeEnabled();
  });

  test("tabs are real tabs, keyboard-operable, and the spam count is spelled out", async ({ page, context }) => {
    await signInAs(context);
    await page.goto("/");
    const summary = page.getByRole("tab", { name: "Today's Mail" });
    const spam = page.getByRole("tab", { name: /Spam Flashcards/ });
    await expect(summary).toHaveAttribute("aria-selected", "true");
    await expect(spam).toContainText("2 suspected spam emails");
    await summary.focus();
    await page.keyboard.press("ArrowRight");
    await expect(spam).toHaveAttribute("aria-selected", "true");
    await expect(spam).toBeFocused();
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "tab-spam");
    await expect(page).toHaveURL(/\?tab=spam$/);
    await page.reload();
    await expect(page.getByRole("tab", { name: /Spam Flashcards/ })).toHaveAttribute("aria-selected", "true");
  });

  test("Delete asks first, moves the message to Trash, and Undo brings it back", async ({ page, context }) => {
    const token = await signInAs(context);
    await page.goto("/");
    await openSpamTab(page);

    await page.getByRole("article", { name: MEGADEALS }).getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("LIMITED TIME: 50% OFF EVERYTHING");
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("status").filter({ hasText: "to Trash" })).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(2);

    expect((await gmailChanges(token)).map((c) => `${c.verb}:${c.id}`)).toEqual(["trash:m2", "untrash:m2"]);
  });

  test("Not spam is remembered: the card stays gone after a reload", async ({ page, context }) => {
    await signInAs(context);
    await page.goto("/?tab=spam");
    await expect(page.getByRole("article")).toHaveCount(2);

    await page.getByRole("article", { name: TOOLS }).getByRole("button", { name: "Not spam" }).click();
    await expect(page.getByText("Marked “This week in tools” as not spam. It won't be flagged again.")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("tab", { name: /Spam Flashcards/ })).toContainText("1 suspected spam email");
  });

  test("a sender that only takes email gets a prefilled Gmail message, not a dead button", async ({ page, context }) => {
    await signInAs(context);
    await page.goto("/?tab=spam");
    const card = page.getByRole("article", { name: TOOLS });
    const link = card.getByRole("link", { name: "Email to unsubscribe" });
    await expect(link).toHaveAttribute("href", /^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=leave%40toolsweekly\.example/);
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("Unsubscribe reports a partial result exactly", async ({ page, context }) => {
    await signInAs(context);
    await page.route("**/api/actions", (route) =>
      route.fulfill({ json: { ok: true, archived: false, warning: "archive_failed" } })
    );
    await page.goto("/?tab=spam");
    await page.getByRole("article", { name: MEGADEALS }).getByRole("button", { name: "Unsubscribe" }).click();
    await expect(
      page.getByText("Unsubscribed from MegaDeals, but couldn't archive the message. It's still in your inbox.")
    ).toBeVisible();
    await expect(page.getByText(/and archived the message/)).toHaveCount(0);
  });

  test("an unsubscribe the sender refused says you are still subscribed", async ({ page, context }) => {
    await signInAs(context);
    await page.route("**/api/actions", (route) =>
      route.fulfill({ status: 502, json: { ok: false, code: "unsubscribe_rejected", error: "HTTP 404" } })
    );
    await page.goto("/?tab=spam");
    const card = page.getByRole("article", { name: MEGADEALS });
    await card.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(card.getByRole("alert")).toContainText("You are still subscribed.");
    await expect(page.getByRole("article")).toHaveCount(2);
  });

  test("an ended session offers Sign in again, which starts Google sign-in instead of repeating the request", async ({ page, context }) => {
    await signInAs(context);
    for (const api of ["**/api/emails/today**", "**/api/emails/spam**"]) {
      await page.route(api, (route) => route.fulfill({ status: 401, json: { ok: false, code: "unauthenticated", error: "Not authenticated" } }));
    }
    await page.route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<title>Google</title>" }));
    await page.goto("/");
    const alert = page.getByRole("alert").filter({ hasText: "Your session has ended. Sign in again to continue." });
    await expect(alert).toBeVisible();
    await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);

    let apiCallsAfterClick = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/emails/")) apiCallsAfterClick++;
    });
    const toGoogle = page.waitForRequest((req) => req.url().startsWith("https://accounts.google.com/"));
    await alert.getByRole("button", { name: "Sign in again" }).click();
    expect((await toGoogle).url()).toContain("accounts.google.com");
    expect(apiCallsAfterClick).toBe(0);
  });

  test("a load that never answers says it is slow, then offers Try again instead of spinning forever", async ({ page, context }) => {
    test.setTimeout(60_000);
    await signInAs(context);
    await page.route("**/api/emails/today**", () => {
      // Never answered.
    });
    await page.goto("/");
    await expect(page.getByText("This is taking longer than usual…")).toBeVisible({ timeout: 10_000 });
    const alert = page.getByRole("alert").filter({ hasText: "Inbox Buddy is taking too long to answer" });
    await expect(alert).toBeVisible({ timeout: 25_000 });
    await page.unroute("**/api/emails/today**");
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("3 messages in the last 24 hours")).toBeVisible();
  });

  for (const [name, fail] of [
    ["the connection drops", (route: import("@playwright/test").Route) => route.abort("internetdisconnected")],
    [
      "a proxy answers with an HTML 502",
      (route: import("@playwright/test").Route) =>
        route.fulfill({ status: 502, contentType: "text/html", body: "<html><body>502 Bad Gateway</body></html>" }),
    ],
  ] as const) {
    test(`a card action shows a plain message when ${name}, and nothing is thrown`, async ({ page, context }) => {
      await signInAs(context);
      const errors = watchErrors(page);
      await page.route("**/api/actions", fail);
      await page.goto("/?tab=spam");
      const card = page.getByRole("article", { name: TOOLS });
      await card.getByRole("button", { name: "Not spam" }).click();
      await expect(card.getByRole("alert")).toHaveText(
        name === "the connection drops"
          ? "Couldn't reach Inbox Buddy. Check your connection and try again."
          : "That didn't work. Try again in a moment."
      );
      await expect(card.getByRole("button", { name: "Not spam" })).toBeEnabled();
      expect(errors).toEqual([]);
    });
  }

  test("the summary and spam list show a plain message, not parser text, on an HTML error page", async ({ page, context }) => {
    await signInAs(context);
    await page.route("**/api/emails/**", (route) =>
      route.fulfill({ status: 502, contentType: "text/html", body: "<html><body>502 Bad Gateway</body></html>" })
    );
    await page.goto("/");
    await expect(page.getByRole("alert").filter({ hasText: "Inbox Buddy couldn't load today's mail. Try again in a moment." })).toBeVisible();
    await page.getByRole("tab", { name: /Spam Flashcards/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Inbox Buddy couldn't check for spam. Try again in a moment." })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Unexpected token");
  });

  test("revoked Gmail access offers Reconnect Gmail instead of 'try again'", async ({ page, context }) => {
    await signInAs(context, { accessToken: "revoked" });
    await page.goto("/");
    await expect(page.getByRole("alert").filter({ hasText: "Inbox Buddy has lost access to your Gmail." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reconnect Gmail" })).toBeVisible();
  });

  test("the dashboard works in Spanish", async ({ page, context }) => {
    await signInAs(context);
    await context.addCookies([{ name: "lang", value: "es", domain: "localhost", path: "/" }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByText("3 mensajes en las últimas 24 horas")).toBeVisible();
    await page.getByRole("tab", { name: /Tarjetas de spam/ }).click();
    await expect(page.getByRole("button", { name: "No es spam" })).toHaveCount(2);
  });
});

test.describe("phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });

  test("every control is at least 44 px and nothing overflows sideways", async ({ page, context }) => {
    await signInAs(context);
    await context.addCookies([{ name: "lang", value: "es", domain: "localhost", path: "/" }]);
    await page.goto("/?tab=spam");
    await expect(page.getByRole("article")).toHaveCount(2);

    const small = await page.evaluate(() =>
      [...document.querySelectorAll("main button, main a, header button")]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => {
          const box = el.getBoundingClientRect();
          return { text: (el.textContent || el.getAttribute("aria-label") || "").trim(), width: box.width, height: box.height };
        })
        .filter((b) => b.width < 44 || b.height < 44)
    );
    expect(small).toEqual([]);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
