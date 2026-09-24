"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, Bell, BellRing, Check, ChevronRight, Clock, ExternalLink, Inbox, RefreshCw, X } from "lucide-react";
import { gmailThreadUrl } from "@/lib/gmail-links";
import { parseSender } from "@/lib/sender";
import type { BriefingBucket, BriefingItem } from "@/lib/ai";
import type { TodayPayload } from "@/lib/payloads";
import { useI18n } from "../I18nProvider";
import { ErrorState, SkeletonLines, SlowNotice } from "./States";
import { errorMessageKey } from "./errors";
import { formatResetTime } from "./format";
import type { LoadState } from "./useInbox";
import { briefingCounts, briefingHeadline, isDueToday, OPEN_BUCKETS } from "./briefing";
import { isDue, LATER_CHOICES, laterTime, snoozedIds, type LaterChoice, type LaterEntry, type LaterKind, type LaterMap } from "./later";

type Email = TodayPayload["emails"][number];

function ReceivedTime({ date, locale }: { date: string; locale: string }) {
  const time = Date.parse(date);
  if (Number.isNaN(time)) return null;
  return (
    <time dateTime={new Date(time).toISOString()} className="shrink-0 text-xs text-muted">
      {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(time)}
    </time>
  );
}

function OpenInGmail({ email, accountEmail }: { email: Email; accountEmail: string }) {
  const { t } = useI18n();
  return (
    <a
      href={gmailThreadUrl(email.threadId, accountEmail)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("summary.openInGmailAria", { subject: email.subject })}
      title={t("summary.openInGmail")}
      className="tap-target flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </a>
  );
}

function MessageRow({ email, accountEmail, locale }: { email: Email; accountEmail: string; locale: string }) {
  const { name } = parseSender(email.from);
  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        {/* Cut to one line; the whole sender and subject are in the
            tooltip (and in the DOM, for assistive tech). */}
        <p className="truncate text-sm" title={`${name} · ${email.subject}`}>
          <span className="font-medium">{name}</span>
          <span className="text-muted"> · {email.subject}</span>
        </p>
      </div>
      <ReceivedTime date={email.date} locale={locale} />
      <OpenInGmail email={email} accountEmail={accountEmail} />
    </li>
  );
}

// Which way a row's later menu is open: Snooze or Remind me.
type LaterMenu = LaterKind | null;

function formatLaterTime(until: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(until);
}

// The three times a Snooze or Remind me can be set for, as a small group of
// buttons under the row. Escape closes it and returns focus to the button
// that opened it.
function LaterChoices({
  id,
  kind,
  subject,
  locale,
  onPick,
  onClose,
}: {
  id: string;
  kind: LaterKind;
  subject: string;
  locale: string;
  onPick: (choice: LaterChoice) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const first = useRef<HTMLButtonElement>(null);
  // The times are worked out once, when the menu opens.
  const [now] = useState(() => new Date());
  useEffect(() => first.current?.focus(), []);
  return (
    <div
      id={id}
      role="group"
      aria-label={t(kind === "snooze" ? "later.snoozeMenu" : "later.remindMenu", { subject })}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="mt-2 flex basis-full flex-wrap gap-2"
    >
      {LATER_CHOICES.map((choice, i) => (
        <button
          key={choice}
          ref={i === 0 ? first : undefined}
          onClick={() => onPick(choice)}
          className="tap-h inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
        >
          {t(`later.choice.${choice}`)}
          <span className="font-normal text-muted">{formatLaterTime(laterTime(choice, now), locale)}</span>
        </button>
      ))}
      {/* Nothing runs in the background (useLater.ts): say so before a reminder is set. */}
      {kind === "remind" && <p className="basis-full text-xs text-muted">{t("later.remindNote")}</p>}
    </div>
  );
}

const ICON_BUTTON =
  "tap-target flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground aria-expanded:bg-surface-hover aria-expanded:text-foreground";

// One briefing line: who, what they want (the model's line, or the subject
// when it gave none), any date it found, and Open in Gmail / Snooze /
// Remind me / Done. The model's text is rendered as plain text only. A row
// whose Snooze or reminder has come due is highlighted.
function BriefingRow({
  item,
  email,
  accountEmail,
  locale,
  localDate,
  pending,
  due,
  onDone,
  onLater,
}: {
  item: BriefingItem;
  email: Email;
  accountEmail: string;
  locale: string;
  localDate: string;
  pending: boolean;
  due: LaterKind | null;
  onDone: () => void;
  onLater: (kind: LaterKind, choice: LaterChoice) => void;
}) {
  const { t } = useI18n();
  const { name } = parseSender(email.from);
  const [menu, setMenu] = useState<LaterMenu>(null);
  const snoozeButton = useRef<HTMLButtonElement>(null);
  const remindButton = useRef<HTMLButtonElement>(null);
  const triggers = { snooze: snoozeButton, remind: remindButton };
  const menuId = `later-${item.id}`;
  const dueToday = isDueToday(item, localDate);

  function close() {
    const opened = menu;
    setMenu(null);
    if (opened) triggers[opened].current?.focus();
  }

  const trigger = (kind: LaterKind) => (
    <button
      ref={triggers[kind]}
      onClick={() => setMenu(menu === kind ? null : kind)}
      aria-expanded={menu === kind}
      aria-controls={menu === kind ? menuId : undefined}
      aria-label={t(kind === "snooze" ? "later.snoozeAria" : "later.remindAria", { subject: email.subject })}
      title={t(kind === "snooze" ? "later.snoozeHint" : "later.remindHint")}
      className={ICON_BUTTON}
    >
      {kind === "snooze" ? (
        <AlarmClock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      ) : (
        <Bell className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      )}
    </button>
  );

  return (
    <li
      data-due={due ?? undefined}
      className={`flex flex-wrap items-start gap-x-3 py-2 ${due ? "-mx-2 rounded-lg bg-accent-soft px-2" : ""}`}
    >
      <div className="min-w-0 flex-1 basis-48">
        <p className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium" title={name}>
            {name}
          </span>
          <ReceivedTime date={email.date} locale={locale} />
          {due && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
              <BellRing className="h-3 w-3" strokeWidth={2} aria-hidden />
              {t(`later.badge.${due}`)}
            </span>
          )}
        </p>
        <p className="text-sm">{item.action || email.subject}</p>
        {item.action && (
          <p className="truncate text-xs text-muted" title={email.subject}>
            {email.subject}
          </p>
        )}
        {(item.due || dueToday) && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            {dueToday ? (item.due ? t("briefing.dueTodayWith", { due: item.due }) : t("briefing.dueToday")) : item.due}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <OpenInGmail email={email} accountEmail={accountEmail} />
        {trigger("snooze")}
        {trigger("remind")}
        <button
          onClick={onDone}
          disabled={pending}
          aria-label={t("briefing.doneAria", { subject: email.subject })}
          title={t("briefing.doneHint")}
          className="tap-h inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {pending ? t("briefing.working") : t("briefing.done")}
        </button>
      </div>
      {menu && (
        <LaterChoices
          id={menuId}
          kind={menu}
          subject={email.subject}
          locale={locale}
          onPick={(choice) => {
            setMenu(null);
            onLater(menu, choice);
          }}
          onClose={close}
        />
      )}
    </li>
  );
}

type RowHandlers = {
  accountEmail: string;
  locale: string;
  localDate: string;
  pendingId: string | null;
  dueKinds: ReadonlyMap<string, LaterKind>;
  onDone: (item: BriefingItem, email: Email) => void;
  onLater: (item: BriefingItem, email: Email, kind: LaterKind, choice: LaterChoice) => void;
};

function Briefing({ items, byId, ...rowProps }: { items: BriefingItem[]; byId: Map<string, Email> } & RowHandlers) {
  const { t } = useI18n();
  const rows = (bucket: BriefingBucket) =>
    items.flatMap((item) => {
      const email = byId.get(item.id);
      return item.bucket === bucket && email ? [{ item, email }] : [];
    });
  const row = ({ item, email }: { item: BriefingItem; email: Email }) => (
    <BriefingRow
      key={item.id}
      item={item}
      email={email}
      accountEmail={rowProps.accountEmail}
      locale={rowProps.locale}
      localDate={rowProps.localDate}
      pending={rowProps.pendingId === item.id}
      due={rowProps.dueKinds.get(item.id) ?? null}
      onDone={() => rowProps.onDone(item, email)}
      onLater={(kind, choice) => rowProps.onLater(item, email, kind, choice)}
    />
  );
  const noise = rows("noise");

  if (items.length === 0) return <p className="text-sm text-muted">{t("briefing.allDone")}</p>;
  return (
    <div className="space-y-4">
      {OPEN_BUCKETS.map((bucket) => {
        const list = rows(bucket);
        if (list.length === 0) return null;
        return (
          <section key={bucket}>
            <h3 className="text-sm font-semibold">{t(`briefing.bucket.${bucket}`, { count: list.length })}</h3>
            <ul className="mt-1 divide-y divide-border">{list.map(row)}</ul>
          </section>
        );
      })}
      {noise.length > 0 && (
        <details className="group">
          <summary className="tap-h flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" strokeWidth={2} aria-hidden />
            {t("briefing.bucket.noise", { count: noise.length })}
          </summary>
          <ul className="mt-1 divide-y divide-border">{noise.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

// Snoozes and reminders that have come due. Items still in today's list
// are highlighted there too; one that isn't (it came in on an earlier day)
// is linked in Gmail by its thread, since nothing else about it is kept.
function DueBanner({
  due,
  byId,
  accountEmail,
  onDismiss,
}: {
  due: { id: string; entry: LaterEntry }[];
  byId: Map<string, Email>;
  accountEmail: string;
  onDismiss: (id: string) => void;
}) {
  const { t } = useI18n();
  if (due.length === 0) return null;
  return (
    <ul role="status" aria-label={t("later.bannerLabel")} className="mb-3 space-y-2">
      {due.map(({ id, entry }) => {
        const email = byId.get(id);
        return (
          <li key={id} className="flex items-center gap-2 rounded-xl border border-border bg-accent-soft py-1 pl-3 pr-1 text-sm">
            <BellRing className="h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
            <span className="min-w-0 flex-1 py-1">
              {email
                ? t(`later.due.${entry.kind}`, { subject: email.subject })
                : t(`later.dueEarlier.${entry.kind}`)}
            </span>
            {!email && (
              <a
                href={gmailThreadUrl(entry.threadId, accountEmail)}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-h inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 font-medium text-accent transition-colors hover:bg-surface-hover"
              >
                <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                {t("summary.openInGmail")}
              </a>
            )}
            <button
              onClick={() => onDismiss(id)}
              aria-label={t("later.dismissAria", { subject: email?.subject ?? t("later.anEmail") })}
              title={t("toast.dismiss")}
              className="tap-target flex shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Today's items that are snoozed, with when each comes back and a way to
// bring it back now.
function SnoozedList({
  snoozed,
  locale,
  onUnsnooze,
}: {
  snoozed: { email: Email; until: number }[];
  locale: string;
  onUnsnooze: (id: string) => void;
}) {
  const { t } = useI18n();
  if (snoozed.length === 0) return null;
  return (
    <details className="group mt-4 rounded-2xl border border-border bg-surface px-5 py-3">
      <summary className="tap-h flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" strokeWidth={2} aria-hidden />
        {t("later.snoozedList", { count: snoozed.length })}
      </summary>
      <ul className="mt-1 divide-y divide-border">
        {snoozed.map(({ email, until }) => (
          <li key={email.id} className="flex items-center gap-3 py-1.5">
            <p className="min-w-0 flex-1 truncate text-sm" title={email.subject}>
              <span className="font-medium">{parseSender(email.from).name}</span>
              <span className="text-muted"> · {email.subject}</span>
            </p>
            <span className="shrink-0 text-xs text-muted">{t("later.until", { time: formatLaterTime(until, locale) })}</span>
            <button
              onClick={() => onUnsnooze(email.id)}
              aria-label={t("later.unsnoozeAria", { subject: email.subject })}
              className="tap-h inline-flex shrink-0 items-center rounded-lg border border-border px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              {t("later.unsnooze")}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function SummaryPanel({
  state,
  accountEmail,
  refreshing,
  onRefresh,
  onRetry,
  doneIds,
  pendingId,
  onDone,
  later,
  onLater,
  onDismissDue,
}: {
  state: LoadState<TodayPayload>;
  accountEmail: string;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
  // Briefing items marked Done in this session (archived; hidden until Undo).
  doneIds: ReadonlySet<string>;
  // The item whose Done is in flight.
  pendingId: string | null;
  onDone: (item: BriefingItem, email: Email) => void;
  // Snooze / Remind me entries (components/dashboard/later.ts) and the time
  // they are measured against.
  later: { entries: LaterMap; now: number };
  onLater: (item: BriefingItem, email: Email, kind: LaterKind, choice: LaterChoice) => void;
  // Dismisses a due reminder, or brings a snoozed item back now.
  onDismissDue: (id: string) => void;
}) {
  const { t, locale } = useI18n();

  if (state.status === "error") {
    return (
      <ErrorState
        message={t(errorMessageKey(state.code, "errors.summaryLoad"))}
        code={state.code}
        onRetry={onRetry}
      />
    );
  }

  const data = state.status === "ready" ? state.data : null;
  const byId = new Map(data?.emails.map((e) => [e.id, e]) ?? []);
  const group = (ids: string[]) => ids.map((id) => byId.get(id)).filter((e): e is Email => Boolean(e));
  // Everything below is what is left: Done items are gone, and snoozed ones
  // are hidden until their time.
  const snoozed = snoozedIds(later.entries, later.now);
  const remaining = data?.emails.filter((e) => !doneIds.has(e.id)) ?? [];
  const briefing = data?.briefing?.filter((item) => !doneIds.has(item.id) && !snoozed.has(item.id)) ?? null;
  const due = Object.entries(later.entries)
    .filter(([id, entry]) => isDue(entry, later.now) && !doneIds.has(id))
    .map(([id, entry]) => ({ id, entry }));
  const dueKinds = new Map(due.filter(({ id }) => briefing?.some((i) => i.id === id)).map(({ id, entry }) => [id, entry.kind]));
  const snoozedToday = data?.briefing
    ? remaining.flatMap((email) => (snoozed.has(email.id) ? [{ email, until: later.entries[email.id].until }] : []))
    : [];
  const headline = briefing && data ? briefingHeadline(briefingCounts(briefing, data.localDate), t) || t("briefing.countNone") : "";

  return (
    <div>
      {data && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {/* The briefing's counts replace "N messages today"; both count
              only what is left. */}
          <p className="inline-flex flex-wrap items-center gap-x-1.5 text-sm text-muted">
            <Inbox className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {briefing ? (
              <span className="font-medium text-foreground">{headline}</span>
            ) : (
              !data.truncated && t("summary.count", { count: remaining.length })
            )}
            {data.truncated && (
              <span>
                {briefing && "· "}
                {t("summary.truncated", { shown: data.count, total: data.totalEstimate })}
              </span>
            )}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted">
            <time dateTime={data.generatedAt}>
              {t("summary.updated", {
                time: new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(Date.parse(data.generatedAt)),
              })}
            </time>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="tap-h inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 font-medium text-foreground transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} strokeWidth={2} aria-hidden />
              {refreshing ? t("summary.refreshing") : t("summary.refresh")}
            </button>
          </div>
        </div>
      )}

      {data && <DueBanner due={due} byId={byId} accountEmail={accountEmail} onDismiss={onDismissDue} />}

      <div className="rounded-2xl border border-border bg-surface p-5" aria-busy={!data}>
        {!data ? (
          <SkeletonLines />
        ) : data.count === 0 ? (
          <p className="text-sm text-muted">{t("summary.empty")}</p>
        ) : briefing ? (
          <Briefing
            items={briefing}
            byId={byId}
            accountEmail={accountEmail}
            locale={locale}
            localDate={data.localDate}
            pendingId={pendingId}
            dueKinds={dueKinds}
            onDone={onDone}
            onLater={onLater}
          />
        ) : (
          <div className="space-y-4">
            {data.groups && data.groups.toCheck.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold">{t("summary.group.toCheck", { count: data.groups.toCheck.length })}</h3>
                <ul className="mt-1 divide-y divide-border">
                  {group(data.groups.toCheck).map((e) => (
                    <MessageRow key={e.id} email={e} accountEmail={accountEmail} locale={locale} />
                  ))}
                </ul>
              </section>
            )}
            {data.groups && data.groups.bulk.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold">{t("summary.group.bulk", { count: data.groups.bulk.length })}</h3>
                <ul className="mt-1 divide-y divide-border">
                  {group(data.groups.bulk).map((e) => (
                    <MessageRow key={e.id} email={e} accountEmail={accountEmail} locale={locale} />
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      {/* Outside the aria-busy box, so it is announced while loading. */}
      {!data && <SlowNotice />}

      {data && data.count > 0 && (
        <>
          <p className="mt-2 text-sm text-muted">
            {t(`summary.ai.${data.aiStatus}`, { time: data.aiResetsAt ? formatResetTime(data.aiResetsAt, locale) : "" })}
          </p>
          <SnoozedList snoozed={snoozedToday} locale={locale} onUnsnooze={onDismissDue} />
          {data.briefing && remaining.length > 0 && (
            <details className="group mt-4 rounded-2xl border border-border bg-surface px-5 py-3">
              <summary className="tap-h flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden gap-1.5 text-sm font-medium">
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                  strokeWidth={2}
                  aria-hidden
                />
                {t("summary.allMessages", { count: remaining.length })}
              </summary>
              <ul className="mt-1 divide-y divide-border">
                {remaining.map((e) => (
                  <MessageRow key={e.id} email={e} accountEmail={accountEmail} locale={locale} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
