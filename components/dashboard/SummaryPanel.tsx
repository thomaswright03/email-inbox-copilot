"use client";

import { Check, ChevronRight, Clock, ExternalLink, Inbox, RefreshCw } from "lucide-react";
import { gmailThreadUrl } from "@/lib/gmail-links";
import { parseSender } from "@/lib/sender";
import type { BriefingBucket, BriefingItem } from "@/lib/ai";
import type { TodayPayload } from "@/lib/payloads";
import { useI18n } from "../I18nProvider";
import { ErrorState, SkeletonLines, SlowNotice } from "./States";
import { errorMessageKey } from "./errors";
import { formatResetTime } from "./format";
import type { LoadState } from "./useInbox";

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

// One briefing line: who, what they want (the model's line, or the subject
// when it gave none), any date it found, and Open in Gmail / Done. The
// model's text is rendered as plain text only.
function BriefingRow({
  item,
  email,
  accountEmail,
  locale,
  pending,
  onDone,
}: {
  item: BriefingItem;
  email: Email;
  accountEmail: string;
  locale: string;
  pending: boolean;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const { name } = parseSender(email.from);
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm">
          <span className="truncate font-medium" title={name}>
            {name}
          </span>
          <ReceivedTime date={email.date} locale={locale} />
        </p>
        <p className="text-sm">{item.action || email.subject}</p>
        {item.action && (
          <p className="truncate text-xs text-muted" title={email.subject}>
            {email.subject}
          </p>
        )}
        {item.due && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
            <Clock className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
            {item.due}
          </p>
        )}
      </div>
      <OpenInGmail email={email} accountEmail={accountEmail} />
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
    </li>
  );
}

const OPEN_BUCKETS = ["reply", "deadline", "fyi"] as const satisfies readonly BriefingBucket[];

function Briefing({
  items,
  byId,
  accountEmail,
  locale,
  pendingId,
  onDone,
}: {
  items: BriefingItem[];
  byId: Map<string, Email>;
  accountEmail: string;
  locale: string;
  pendingId: string | null;
  onDone: (item: BriefingItem, email: Email) => void;
}) {
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
      accountEmail={accountEmail}
      locale={locale}
      pending={pendingId === item.id}
      onDone={() => onDone(item, email)}
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

// "3 need a reply · 1 with a deadline · 14 FYI"; buckets with nothing in
// them are left out.
function briefingCounts(items: BriefingItem[], t: ReturnType<typeof useI18n>["t"]): string {
  return OPEN_BUCKETS.map((bucket) => ({ bucket, count: items.filter((i) => i.bucket === bucket).length }))
    .filter(({ count }) => count > 0)
    .map(({ bucket, count }) => t(`briefing.count.${bucket}`, { count }))
    .join(" · ");
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
  const briefing = data?.briefing?.filter((item) => !doneIds.has(item.id)) ?? null;
  const counts = briefing ? briefingCounts(briefing, t) : "";

  return (
    <div>
      {data && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Inbox className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {data.truncated
              ? t("summary.truncated", { shown: data.count, total: data.totalEstimate })
              : t("summary.count", { count: data.count })}
            {counts && <span className="font-medium text-foreground">· {counts}</span>}
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
            pendingId={pendingId}
            onDone={onDone}
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
          {data.briefing && (
            <details className="group mt-4 rounded-2xl border border-border bg-surface px-5 py-3">
              <summary className="tap-h flex cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden gap-1.5 text-sm font-medium">
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"
                  strokeWidth={2}
                  aria-hidden
                />
                {t("summary.allMessages", { count: data.count })}
              </summary>
              <ul className="mt-1 divide-y divide-border">
                {data.emails.map((e) => (
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
