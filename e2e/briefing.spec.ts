import { expect, test, type Page } from "@playwright/test";
import { E2E_AI_PORT, GEMINI_STUB_PORT } from "./constants";
import { gmailChanges, signInAs } from "./session";

// The Actionable Briefing with AI on, against the second server from the
// same build (playwright.config.ts): Gmail is the stand-in inbox
// (e2e/gmail-stub.mjs) and Gemini is e2e/gemini-stub.mjs, which sorts Ana's
// contract into Needs a reply, the invoice into Has a deadline (due today),
// the newsletter into FYI and the sale into Noise, and flags the sale as
// spam. Serial, so the Gemini stand-in's call count belongs to one test.
test.use({ baseURL: `http://localhost:${E2E_AI_PORT}` });
test.describe.configure({ mode: "serial" });

const CONTRACT = "Contract review before Friday";

async function geminiCalls(): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${GEMINI_STUB_PORT}/__calls`);
  return ((await res.json()) as { calls: number }).calls;
}

async function openBriefing(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Needs a reply (1)" })).toBeVisible();
}

test.describe("AI briefing", () => {
  test("sorts the inbox into buckets, counts them in the header, and flags spam from the same call", async ({ page, context }) => {
    await signInAs(context);
    const before = await geminiCalls();
    await openBriefing(page);

    await expect(page.getByText("1 needs a reply · 1 deadline today · 1 FYI")).toBeVisible();
    await expect(page.getByText(/messages today/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Has a deadline or is time-sensitive (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "FYI (1)" })).toBeVisible();
    await expect(page.getByText("Ana wants your comments on the contract")).toBeVisible();
    await expect(page.getByText("Due today: 5 pm")).toBeVisible();
    // Noise is collapsed.
    const noise = page.locator("details", { hasText: "Noise (1)" }).first();
    await expect(noise).not.toHaveAttribute("open", "");
    await expect(page.getByText(/AI-generated summary/)).toBeVisible();

    await page.getByRole("tab", { name: /Spam Flashcards/ }).click();
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByText(/^Flagged by AI/)).toBeVisible();
    // One model call served both tabs.
    expect((await geminiCalls()) - before).toBe(1);
  });

  test("Done archives the item, the header counts what is left, and Undo brings it back, with no new model call", async ({ page, context }) => {
    const token = await signInAs(context);
    await openBriefing(page);
    const calls = await geminiCalls();

    await page.getByRole("button", { name: `Mark “${CONTRACT}” done and archive it` }).click();
    await expect(page.getByRole("status").filter({ hasText: `Archived “${CONTRACT}”.` })).toBeVisible();
    await expect(page.getByText("Ana wants your comments on the contract")).toHaveCount(0);
    await expect(page.getByText("1 deadline today · 1 FYI")).toBeVisible();

    // A reload re-reads Gmail but reuses the model's answer.
    await page.reload();
    await expect(page.getByText("1 deadline today · 1 FYI")).toBeVisible();
    await expect(page.getByText("Ana wants your comments on the contract")).toHaveCount(0);

    await page.getByRole("button", { name: `Mark “Invoice 2291 due today” done and archive it` }).click();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Undone.")).toBeVisible();
    await expect(page.getByText("Pay invoice 2291")).toBeVisible();
    await expect(page.getByText("1 deadline today · 1 FYI")).toBeVisible();

    expect((await gmailChanges(token)).map((c) => `${c.verb}:${c.id}`)).toEqual(["modify:m1", "modify:m5", "modify:m5"]);
    expect(await geminiCalls()).toBe(calls);
  });

  test("Snooze hides the item until later, across a reload, without touching Gmail", async ({ page, context }) => {
    const token = await signInAs(context);
    await openBriefing(page);

    await page.getByRole("button", { name: `Snooze “${CONTRACT}”` }).click();
    const menu = page.getByRole("group", { name: `Snooze “${CONTRACT}” until` });
    await expect(menu.getByRole("button", { name: /^Later today/ })).toBeFocused();
    await menu.getByRole("button", { name: /^Tomorrow morning/ }).click();

    await expect(page.getByRole("status").filter({ hasText: `Snoozed “${CONTRACT}” until` })).toBeVisible();
    await expect(page.getByText("Ana wants your comments on the contract")).toHaveCount(0);
    await expect(page.getByText("1 deadline today · 1 FYI")).toBeVisible();
    await expect(page.getByText("Snoozed (1)")).toBeVisible();

    await page.reload();
    await expect(page.getByText("Snoozed (1)")).toBeVisible();
    await expect(page.getByText("Ana wants your comments on the contract")).toHaveCount(0);

    await page.getByText("Snoozed (1)").click();
    await page.getByRole("button", { name: `Show “${CONTRACT}” now` }).click();
    await expect(page.getByText("Ana wants your comments on the contract")).toBeVisible();
    expect(await gmailChanges(token)).toEqual([]);
  });

  test("a snooze whose time has passed brings the item back, highlighted", async ({ page, context }) => {
    await signInAs(context);
    await openBriefing(page);
    await page.getByRole("button", { name: `Snooze “${CONTRACT}”` }).click();
    await page.getByRole("button", { name: /^Later today/ }).click();
    await expect(page.getByText("Snoozed (1)")).toBeVisible();

    // Three hours later, as far as the page can tell.
    await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        if (!key.startsWith("inbox-buddy.later.")) continue;
        const entries = JSON.parse(localStorage.getItem(key)!);
        for (const id of Object.keys(entries)) entries[id].until = Date.now() - 1000;
        localStorage.setItem(key, JSON.stringify(entries));
      }
    });
    await page.reload();
    await expect(page.getByText(`Back from snooze: “${CONTRACT}”`)).toBeVisible();
    await expect(page.getByText("Ana wants your comments on the contract")).toBeVisible();
    await expect(page.getByText("1 needs a reply · 1 deadline today · 1 FYI")).toBeVisible();
  });
});

test.describe("AI briefing at phone width (375 px)", () => {
  test.use({ viewport: { width: 375, height: 800 }, hasTouch: true, isMobile: true });

  test("every briefing control is at least 44 px, the snooze menu fits, and nothing overflows sideways", async ({ page, context }) => {
    await signInAs(context);
    await openBriefing(page);
    await page.getByRole("button", { name: `Snooze “${CONTRACT}”` }).click();
    await expect(page.getByRole("group", { name: `Snooze “${CONTRACT}” until` })).toBeVisible();

    const small = await page.evaluate(() =>
      [...document.querySelectorAll("main li button, main li a")]
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
