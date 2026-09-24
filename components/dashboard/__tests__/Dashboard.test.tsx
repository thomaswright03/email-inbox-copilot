// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: null })),
  signOut: vi.fn(),
  signIn: vi.fn(),
}));

import { signIn, signOut, useSession } from "next-auth/react";
import Dashboard from "../Dashboard";
import type { SpamCardPayload, SpamPayload, TodayPayload } from "@/lib/payloads";
import { htmlError, json, renderWithProviders } from "@/components/__tests__/test-utils";

const GENERATED_AT = "2026-09-24T10:42:00.000Z";

const EMAILS: TodayPayload["emails"] = [
  { id: "m1", threadId: "t1", from: "Ana Ruiz <ana@example.com>", subject: "Contract review", date: "Thu, 24 Sep 2026 09:15:00 +0000" },
  { id: "m2", threadId: "t2", from: "Deals <deals@shop.example>", subject: "50% off today", date: "Thu, 24 Sep 2026 08:00:00 +0000" },
];

function today(overrides: Partial<TodayPayload> = {}): TodayPayload {
  return {
    aiStatus: "off",
    summary: null,
    groups: { toCheck: ["m1"], bulk: ["m2"] },
    generatedAt: GENERATED_AT,
    count: 2,
    truncated: false,
    totalEstimate: 2,
    emails: EMAILS,
    ...overrides,
  };
}

const ONE_CLICK: SpamCardPayload = {
  id: "s1",
  threadId: "ts1",
  from: "Deals <deals@shop.example>",
  subject: "50% off today",
  snippet: "Limited time",
  reason: "marketing",
  unsubscribe: { kind: "one-click" },
};
const LINK: SpamCardPayload = {
  id: "s2",
  threadId: "ts2",
  from: "News <news@paper.example>",
  subject: "Weekly digest",
  snippet: "This week",
  reason: "newsletter",
  unsubscribe: { kind: "link", url: "https://paper.example/unsub" },
};
const MAILTO: SpamCardPayload = {
  id: "s3",
  threadId: "ts3",
  from: "list@club.example",
  subject: "Club news",
  snippet: "Hello",
  reason: "newsletter",
  unsubscribe: { kind: "mailto", composeUrl: "https://mail.google.com/mail/?view=cm&to=unsub%40club.example" },
};
const NONE: SpamCardPayload = {
  id: "s4",
  threadId: "ts4",
  from: "Winner <win@prize.example>",
  subject: "You are a winner",
  snippet: "Claim now",
  reason: "phishing_pattern",
  unsubscribe: null,
};

function spam(flashcards: SpamCardPayload[] = [ONE_CLICK], aiStatus: SpamPayload["aiStatus"] = "generated"): SpamPayload {
  return { aiStatus, generatedAt: GENERATED_AT, flashcards };
}

type Handler = (init?: RequestInit, url?: string) => Response | Promise<Response>;
type Routes = { today?: Handler; spam?: Handler; actions?: Handler };

let fetchMock: ReturnType<typeof vi.fn>;

function mockApi(routes: Routes) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/emails/today")) return (routes.today ?? (() => json(today())))(init, url);
    if (url.startsWith("/api/emails/spam")) return (routes.spam ?? (() => json(spam())))(init, url);
    if (url.startsWith("/api/actions")) return (routes.actions ?? (() => json({ ok: true })))(init, url);
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
}

function actionCalls(): { action: string; messageId: string }[] {
  return fetchMock.mock.calls
    .filter(([url]) => String(url) === "/api/actions")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));
}

function renderDashboard({ aiOn = true }: { aiOn?: boolean } = {}) {
  return renderWithProviders(
    <Dashboard userName="Thomas" userEmail="t@example.com" accountId="gid-1" dataRequestCode="code-1" aiOn={aiOn} />
  );
}

async function openSpamTab() {
  fireEvent.click(screen.getByRole("tab", { name: /Spam Flashcards/ }));
  return screen.findAllByRole("article");
}

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
    vi.mocked(useSession).mockReturnValue({ data: null } as unknown as ReturnType<typeof useSession>);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("summary tab", () => {
    it("shows a loading skeleton until the summary arrives", async () => {
      let resolve!: (r: Response) => void;
      mockApi({ today: () => new Promise<Response>((r) => (resolve = r)) });
      renderDashboard();
      const panel = screen.getByRole("tabpanel");
      expect(panel.querySelector('[aria-busy="true"]')).not.toBeNull();
      await act(async () => resolve(json(today())));
      expect(await screen.findByText("Messages to check (1)")).toBeTruthy();
    });

    it("shows the count, the time it was updated, and each message with a Gmail link", async () => {
      mockApi({});
      renderDashboard();
      expect(await screen.findByText("2 messages in the last 24 hours")).toBeTruthy();
      expect(screen.getByText(/^Updated /)).toBeTruthy();
      expect(screen.getByText("Likely promotional or bulk (1)")).toBeTruthy();
      const link = screen.getByRole("link", { name: "Open “Contract review” in Gmail" });
      expect(link.getAttribute("href")).toContain("#all/t1");
      expect(link.getAttribute("href")).toContain("authuser=t%40example.com");
      expect(screen.getByText(/AI features are off/)).toBeTruthy();
    });

    it("doesn't call the rule-sorted list a summary when AI is off on this deployment", async () => {
      mockApi({});
      renderDashboard({ aiOn: false });
      expect(screen.getByRole("tab", { name: "Today's Mail" })).toBeTruthy();
      expect(screen.queryByRole("tab", { name: /Summary/ })).toBeNull();
      const caption = await screen.findByText(/AI features are off/);
      expect(caption.textContent).toMatch(/sorted by simple rules instead of being summarized/);
    });

    it("shows the whole sender and subject of a row on hover", async () => {
      mockApi({});
      renderDashboard();
      await screen.findByText("2 messages in the last 24 hours");
      const link = screen.getByRole("link", { name: "Open “Contract review” in Gmail" });
      expect(link.closest("li")?.querySelector("p")?.getAttribute("title")).toBe("Ana Ruiz · Contract review");
    });

    it("uses the singular for one message", async () => {
      mockApi({ today: () => json(today({ count: 1, totalEstimate: 1, emails: [EMAILS[0]], groups: { toCheck: ["m1"], bulk: [] } })) });
      renderDashboard();
      expect(await screen.findByText("1 message in the last 24 hours")).toBeTruthy();
    });

    it("says when the inbox had more messages than were read", async () => {
      mockApi({ today: () => json(today({ truncated: true, count: 100, totalEstimate: 173 })) });
      renderDashboard();
      expect(await screen.findByText("Showing the newest 100 of about 173 messages from the last 24 hours")).toBeTruthy();
    });

    it("shows an empty state when nothing arrived", async () => {
      mockApi({ today: () => json(today({ count: 0, totalEstimate: 0, emails: [], groups: { toCheck: [], bulk: [] } })) });
      renderDashboard();
      expect(await screen.findByText("No messages in the last 24 hours.")).toBeTruthy();
    });

    it("renders an AI summary without links or images, with the full message list behind a toggle", async () => {
      mockApi({
        today: () =>
          json(
            today({
              aiStatus: "generated",
              summary: "**Important**\n\n- Review the [contract](https://evil.example) ![x](https://evil.example/x.png)",
              groups: null,
            })
          ),
      });
      renderDashboard();
      expect(await screen.findByText("Important")).toBeTruthy();
      expect(screen.getByText(/AI-generated summary/)).toBeTruthy();
      expect(document.querySelector('a[href="https://evil.example"]')).toBeNull();
      expect(document.querySelector("img")).toBeNull();
      expect(screen.getByText("All messages (2)")).toBeTruthy();
    });

    it("says when today's AI budget is used up and when AI summaries come back", async () => {
      const resetsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockApi({ today: () => json(today({ aiStatus: "budget", aiResetsAt: resetsAt })) });
      renderDashboard();
      const caption = await screen.findByText(/Today's AI allowance is used up/);
      const time = new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(new Date(resetsAt));
      expect(caption.textContent).toContain(`AI summaries come back at ${time}`);
    });

    it("tells the user when the AI summary failed and a rule-based list is shown instead", async () => {
      mockApi({ today: () => json(today({ aiStatus: "unavailable" })) });
      renderDashboard();
      expect(await screen.findByText(/The AI summary isn't available right now/)).toBeTruthy();
    });

    it("Refresh re-requests both lists, bypassing the cache", async () => {
      mockApi({});
      renderDashboard();
      await screen.findByText("2 messages in the last 24 hours");
      fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Refresh" })).toBeTruthy());
      const urls = fetchMock.mock.calls.map(([u]) => String(u));
      expect(urls).toContain("/api/emails/today?lang=en&refresh=1");
      expect(urls).toContain("/api/emails/spam?refresh=1");
    });

    it("shows a plain sentence, not parser text, when the server answers with an HTML error page", async () => {
      mockApi({ today: () => htmlError(502) });
      renderDashboard();
      expect(await screen.findByText("Inbox Buddy couldn't load today's mail. Try again in a moment.")).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/Unexpected token|JSON/);
    });

    it("says the connection failed when the request never reached the server, and Try again reloads", async () => {
      let calls = 0;
      mockApi({
        today: () => {
          calls++;
          if (calls === 1) throw new TypeError("Failed to fetch");
          return json(today());
        },
      });
      renderDashboard();
      expect(await screen.findByText("Couldn't reach Inbox Buddy. Check your connection and try again.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("2 messages in the last 24 hours")).toBeTruthy();
    });

    it("says a slow load is taking longer than usual, then stops waiting and offers Try again", async () => {
      vi.useFakeTimers();
      let calls = 0;
      mockApi({ today: () => (++calls === 1 ? new Promise<Response>(() => {}) : json(today())) });
      renderDashboard();
      expect(screen.queryByText("This is taking longer than usual…")).toBeNull();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByText("This is taking longer than usual…")).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText("Inbox Buddy is taking too long to answer. Check your connection and try again.")).toBeTruthy();
      vi.useRealTimers();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findByText("2 messages in the last 24 hours")).toBeTruthy();
    });

    it("offers Reconnect Gmail when Gmail access was revoked", async () => {
      mockApi({ today: () => json({ ok: false, code: "gmail_reconnect", error: "x" }, 403) });
      renderDashboard();
      fireEvent.click(await screen.findByRole("button", { name: "Reconnect Gmail" }));
      expect(signIn).toHaveBeenCalledWith("google");
    });

    it("offers Sign in again, not a Try again that can't work, when the session has ended", async () => {
      mockApi({ today: () => json({ ok: false, code: "unauthenticated", error: "x" }, 401) });
      renderDashboard();
      expect(await screen.findByText("Your session has ended. Sign in again to continue.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
      const todayCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/emails/today")).length;
      const before = todayCalls();
      fireEvent.click(screen.getByRole("button", { name: "Sign in again" }));
      expect(signIn).toHaveBeenCalledWith("google");
      expect(todayCalls()).toBe(before);
    });

    it("offers Sign in again in Spanish and French too", async () => {
      mockApi({ today: () => json({ ok: false, code: "unauthenticated", error: "x" }, 401) });
      const { unmount } = renderWithProviders(
        <Dashboard userName="T" userEmail="t@example.com" accountId="gid-1" dataRequestCode={null} aiOn />,
        { locale: "es" }
      );
      expect(await screen.findByRole("button", { name: "Volver a iniciar sesión" })).toBeTruthy();
      unmount();
      renderWithProviders(<Dashboard userName="T" userEmail="t@example.com" accountId="gid-1" dataRequestCode={null} aiOn />, {
        locale: "fr",
      });
      expect(await screen.findByRole("button", { name: "Se reconnecter" })).toBeTruthy();
    });

    it("keeps the retry message for a Gmail outage", async () => {
      mockApi({ today: () => json({ ok: false, code: "gmail_unavailable", error: "x" }, 502) });
      renderDashboard();
      expect(await screen.findByText("Couldn't reach Gmail right now. Try again in a moment.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    });
  });

  describe("tabs", () => {
    it("are announced as tabs, with the spam count spelled out", async () => {
      mockApi({ spam: () => json(spam([ONE_CLICK, LINK, NONE])) });
      renderDashboard();
      const tabs = screen.getAllByRole("tab");
      expect(tabs).toHaveLength(2);
      expect(tabs[0].getAttribute("aria-selected")).toBe("true");
      await screen.findByText("3 suspected spam emails", { exact: false });
      expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("tab-summary");
    });

    it("move with the arrow keys and add each choice to the browser history", async () => {
      const pushState = vi.spyOn(window.history, "pushState");
      mockApi({});
      renderDashboard();
      const summaryTab = screen.getByRole("tab", { name: /Today's Summary/ });
      fireEvent.keyDown(summaryTab, { key: "ArrowRight" });
      expect(screen.getByRole("tab", { name: /Spam Flashcards/ }).getAttribute("aria-selected")).toBe("true");
      expect(pushState).toHaveBeenLastCalledWith(null, "", "/?tab=spam");
      fireEvent.keyDown(screen.getByRole("tab", { name: /Spam Flashcards/ }), { key: "Home" });
      expect(summaryTab.getAttribute("aria-selected")).toBe("true");
      expect(pushState).toHaveBeenLastCalledWith(null, "", "/");
      // Choosing the tab that is already open adds no history entry.
      fireEvent.click(summaryTab);
      expect(pushState).toHaveBeenCalledTimes(2);
      pushState.mockRestore();
      fireEvent.keyDown(summaryTab, { key: "End" });
      fireEvent.keyDown(summaryTab, { key: "ArrowLeft" });
      fireEvent.keyDown(summaryTab, { key: "x" });
    });

    it("opens on the spam tab when the URL says so", async () => {
      searchParams = new URLSearchParams("tab=spam");
      mockApi({});
      renderDashboard();
      expect(screen.getByRole("tab", { name: /Spam Flashcards/ }).getAttribute("aria-selected")).toBe("true");
      expect(await screen.findAllByRole("article")).toHaveLength(1);
    });
  });

  describe("spam tab", () => {
    it("shows skeleton cards while loading, then an empty state", async () => {
      let resolve!: (r: Response) => void;
      mockApi({ spam: () => new Promise<Response>((r) => (resolve = r)) });
      renderDashboard();
      fireEvent.click(screen.getByRole("tab", { name: /Spam Flashcards/ }));
      expect(screen.getByRole("tabpanel").querySelector('[aria-busy="true"]')).not.toBeNull();
      await act(async () => resolve(json(spam([], "generated"))));
      expect(await screen.findByText("No suspected spam in your inbox from the last 24 hours.")).toBeTruthy();
      // The "Flagged by…" caption describes cards, so it isn't shown without any.
      expect(screen.queryByText(/Flagged by/)).toBeNull();
    });

    it("labels rule-based cards when AI is off", async () => {
      mockApi({ spam: () => json(spam([ONE_CLICK], "off")) });
      renderDashboard();
      await openSpamTab();
      expect(screen.getByText(/Flagged by simple rules \(AI is off\)/)).toBeTruthy();
    });

    it("says how many possible spam emails AI hasn't checked yet, and checks them on request", async () => {
      mockApi({ spam: (_init, url) => json({ ...spam([ONE_CLICK]), ...(url?.includes("refresh=1") ? {} : { unchecked: 5 }) }) });
      renderDashboard();
      await openSpamTab();
      expect(screen.getByText("5 more possible spam emails haven't been checked yet.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Check now" }));
      await waitFor(() => expect(screen.queryByText(/haven't been checked yet/)).toBeNull());
      expect(fetchMock.mock.calls.map(([u]) => String(u))).toContain("/api/emails/spam?refresh=1");
    });

    it("when today's AI budget is used up, says so and when it comes back", async () => {
      const resetsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockApi({ spam: () => json({ ...spam([ONE_CLICK]), unchecked: 2, aiResetsAt: resetsAt }) });
      renderDashboard();
      await openSpamTab();
      const notice = screen.getByText(/2 more possible spam emails will be checked by AI at .+, when today's AI allowance resets\./);
      expect(notice.textContent).not.toMatch(/\{time\}/);
      expect(screen.queryByRole("button", { name: "Check now" })).toBeNull();
    });

    it("shows the budget message on an empty rule-based list too", async () => {
      mockApi({ spam: () => json({ ...spam([], "budget"), aiResetsAt: new Date().toISOString() }) });
      renderDashboard();
      fireEvent.click(screen.getByRole("tab", { name: /Spam Flashcards/ }));
      expect(await screen.findByText(/Today's AI allowance is used up, so simple rules are checking for spam until/)).toBeTruthy();
    });

    it("shows a plain error with a retry when the spam list can't load", async () => {
      let calls = 0;
      mockApi({ spam: () => (++calls === 1 ? htmlError(504) : json(spam())) });
      renderDashboard();
      fireEvent.click(screen.getByRole("tab", { name: /Spam Flashcards/ }));
      expect(await screen.findByText("Inbox Buddy couldn't check for spam. Try again in a moment.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      expect(await screen.findAllByRole("article")).toHaveLength(1);
    });

    it("gives each card an Open in Gmail link, a reason, and the right unsubscribe action", async () => {
      mockApi({ spam: () => json(spam([ONE_CLICK, LINK, MAILTO, NONE])) });
      renderDashboard();
      const [oneClick, link, mailto, none] = await openSpamTab();

      expect(within(oneClick).getByRole("link", { name: "Open “50% off today” in Gmail" }).getAttribute("href")).toContain("#all/ts1");
      expect(within(oneClick).getByText("Looks like marketing or a promotion")).toBeTruthy();
      expect(within(oneClick).getByRole("button", { name: /Unsubscribe/ })).toBeTruthy();

      const page = within(link).getByRole("link", { name: /Open unsubscribe page/ });
      expect(page.getAttribute("href")).toBe("https://paper.example/unsub");
      expect(page.getAttribute("rel")).toBe("noopener noreferrer");
      fireEvent.click(page);
      expect(within(link).getByText(/Finish unsubscribing on the sender's page/)).toBeTruthy();

      const email = within(mailto).getByRole("link", { name: /Email to unsubscribe/ });
      expect(email.getAttribute("href")).toContain("https://mail.google.com/mail/?view=cm");
      fireEvent.click(email);
      expect(within(mailto).getByText(/Send the prefilled email in Gmail/)).toBeTruthy();

      expect(within(none).getByText("This sender doesn't offer an unsubscribe option.")).toBeTruthy();
      expect(within(none).getByRole("button", { name: /Not spam/ })).toBeTruthy();
    });
  });

  describe("card actions", () => {
    it("Delete asks first; Cancel and Escape keep the card", async () => {
      mockApi({});
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText(/From Deals: “50% off today”/)).toBeTruthy();
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Delete" }));
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("alertdialog")).toBeNull();

      fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(actionCalls()).toEqual([]);
    });

    it("the Delete confirmation says the email can also be restored from Gmail Trash, in every language", async () => {
      mockApi({});
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
      expect(within(screen.getByRole("alertdialog")).getByText(/restore it from Gmail Trash for 30 days/)).toBeTruthy();
      const { MESSAGES } = await import("@/lib/i18n");
      expect(MESSAGES.es["confirm.body"]).toMatch(/recuperarlo de la papelera de Gmail durante 30 días/);
      expect(MESSAGES.fr["confirm.body"]).toMatch(/récupérer dans la corbeille de Gmail pendant 30 jours/);
    });

    it("only the pressed button says it is working; the others are disabled but keep their labels", async () => {
      mockApi({ actions: () => new Promise<Response>(() => {}) });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Unsubscribe/ }));
      const buttons = within(card).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["Delete", "Working…", "Not spam"]);
      expect(buttons.every((b) => b.hasAttribute("disabled"))).toBe(true);
    });

    it("Delete moves the card to Trash, and Undo restores it", async () => {
      mockApi({});
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("Moved “50% off today” to Trash.")).toBeTruthy();
      await waitFor(() => expect(screen.queryAllByRole("article")).toHaveLength(0));

      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(await screen.findByText("Undone.")).toBeTruthy();
      expect(await screen.findAllByRole("article")).toHaveLength(1);
      expect(actionCalls()).toEqual([
        { action: "delete", messageId: "s1" },
        { action: "undo_delete", messageId: "s1" },
      ]);
    });

    it("says so when Undo fails", async () => {
      mockApi({
        actions: (init) =>
          JSON.parse(String(init?.body)).action === "delete" ? json({ ok: true }) : json({ ok: false, code: "action_failed" }, 502),
      });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Delete/ }));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
      fireEvent.click(await screen.findByRole("button", { name: "Undo" }));
      expect(await screen.findByText("Couldn't undo that. Check the message in Gmail.")).toBeTruthy();
    });

    it("Unsubscribe that fully worked says so and offers to move the message back", async () => {
      mockApi({ actions: () => json({ ok: true, archived: true }) });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Unsubscribe/ }));
      expect(await screen.findByText("Unsubscribed from Deals and archived the message.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await screen.findByText("Undone.");
      expect(actionCalls().map((c) => c.action)).toEqual(["unsubscribe", "undo_archive"]);
    });

    it("Unsubscribe that couldn't archive shows exactly that, not 'archived'", async () => {
      mockApi({ actions: () => json({ ok: true, archived: false, warning: "archive_failed" }) });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Unsubscribe/ }));
      expect(
        await screen.findByText("Unsubscribed from Deals, but couldn't archive the message. It's still in your inbox.")
      ).toBeTruthy();
      expect(screen.queryByText(/and archived the message/)).toBeNull();
      expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    });

    it("Unsubscribe the sender refused is reported as a failure and the card stays", async () => {
      mockApi({ actions: () => json({ ok: false, code: "unsubscribe_rejected", error: "x" }, 502) });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Unsubscribe/ }));
      const alert = await within(card).findByRole("alert");
      expect(alert.textContent).toContain("The sender didn't accept the unsubscribe request. You are still subscribed.");
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });

    it.each([
      ["the network is down", () => Promise.reject(new TypeError("Failed to fetch")), "Couldn't reach Inbox Buddy. Check your connection and try again."],
      ["a proxy answers with HTML", () => htmlError(502), "That didn't work. Try again in a moment."],
    ])("shows a plain message near the card when %s, and the card stays usable", async (_, handler, message) => {
      mockApi({ actions: handler as Handler });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Not spam/ }));
      const alert = await within(card).findByRole("alert");
      expect(alert.textContent).toContain(message);
      expect(within(card).getByRole("button", { name: /Not spam/ }).hasAttribute("disabled")).toBe(false);
      expect(screen.getAllByRole("article")).toHaveLength(1);
    });

    it("a revoked Gmail grant during an action offers Reconnect Gmail on the card", async () => {
      mockApi({ actions: () => json({ ok: false, code: "gmail_reconnect", error: "x" }, 403) });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Not spam/ }));
      fireEvent.click(await within(card).findByRole("button", { name: "Reconnect Gmail" }));
      expect(signIn).toHaveBeenCalledWith("google");
    });

    it("an ended session during an action offers Sign in again on the card", async () => {
      mockApi({ actions: () => json({ ok: false, code: "unauthenticated", error: "x" }, 401) });
      renderDashboard();
      const [card] = await openSpamTab();
      fireEvent.click(within(card).getByRole("button", { name: /Not spam/ }));
      expect((await within(card).findByRole("alert")).textContent).toContain("Your session has ended.");
      fireEvent.click(within(card).getByRole("button", { name: "Sign in again" }));
      expect(signIn).toHaveBeenCalledWith("google");
    });

    it("Not spam removes the card, lowers the count, and can be undone", async () => {
      mockApi({ spam: () => json(spam([ONE_CLICK, LINK])) });
      renderDashboard();
      const [card] = await openSpamTab();
      expect(screen.getByText(/2 suspected spam emails/)).toBeTruthy();
      fireEvent.click(within(card).getByRole("button", { name: /Not spam/ }));
      expect(await screen.findByText("Marked “50% off today” as not spam. This email won't be flagged again; other emails from the sender still can be.")).toBeTruthy();
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
      expect(screen.getByText(/1 suspected spam email$/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
      expect(screen.getAllByRole("article")[0].getAttribute("aria-label")).toBe("Deals: 50% off today");
      expect(actionCalls().map((c) => c.action)).toEqual(["ignore", "undo_ignore"]);
    });

    it("the toast can be dismissed, and goes away on its own", async () => {
      mockApi({ spam: () => json(spam([ONE_CLICK, LINK])) });
      renderDashboard();
      const [first] = await openSpamTab();
      fireEvent.click(within(first).getByRole("button", { name: /Not spam/ }));
      await screen.findByText(/as not spam/);
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByText(/as not spam/)).toBeNull();

      await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(1));
      vi.useFakeTimers();
      fireEvent.click(within(screen.getAllByRole("article")[0]).getByRole("button", { name: /Not spam/ }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByText(/“Weekly digest” as not spam/)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      expect(screen.queryByText(/“Weekly digest” as not spam/)).toBeNull();
    });
  });

  it("signs out when the Google token can no longer be refreshed", async () => {
    vi.mocked(useSession).mockReturnValue({ data: { error: "RefreshAccessTokenError" } } as unknown as ReturnType<typeof useSession>);
    mockApi({});
    renderDashboard();
    await waitFor(() => expect(signOut).toHaveBeenCalled());
  });

  it("header signs out, and the footer builds data-request emails with the account's code", async () => {
    mockApi({});
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalled();
    const copy = screen.getByRole("link", { name: "request a copy" }).getAttribute("href") ?? "";
    expect(copy.startsWith("mailto:")).toBe(true);
    expect(decodeURIComponent(copy)).toContain("Request code: code-1");
    await screen.findByText("2 messages in the last 24 hours");
  });
});
