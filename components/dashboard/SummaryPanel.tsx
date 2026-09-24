"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink, Inbox, RefreshCw } from "lucide-react";
import { gmailThreadUrl } from "@/lib/gmail-links";
import { parseSender } from "@/lib/sender";
import type { TodayPayload } from "@/lib/payloads";
import { useI18n } from "../I18nProvider";
import { ErrorState, SkeletonLines, SlowNotice } from "./States";
import { errorMessageKey } from "./errors";
import { formatResetTime } from "./format";
import type { LoadState } from "./useInbox";

type Email = TodayPayload["emails"][number];

function MessageRow({ email, accountEmail, locale }: { email: Email; accountEmail: string; locale: string }) {
  const { t } = useI18n();
  const { name } = parseSender(email.from);
  const time = Date.parse(email.date);
  return (
    <li className="flex items-center gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{name}</span>
          <span className="text-muted"> · {email.subject}</span>
        </p>
      </div>
      {!Number.isNaN(time) && (
        <time dateTime={new Date(time).toISOString()} className="shrink-0 text-xs text-muted">
          {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(time)}
        </time>
      )}
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
    </li>
  );
}

export default function SummaryPanel({
  state,
  accountEmail,
  refreshing,
  onRefresh,
  onRetry,
}: {
  state: LoadState<TodayPayload>;
  accountEmail: string;
  refreshing: boolean;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  const { t, locale } = useI18n();

  if (state.status === "error") {
    return (
      <ErrorState
        message={t(errorMessageKey(state.code, "errors.summaryLoad"))}
        reconnect={state.code === "gmail_reconnect"}
        onRetry={onRetry}
      />
    );
  }

  const data = state.status === "ready" ? state.data : null;
  const byId = new Map(data?.emails.map((e) => [e.id, e]) ?? []);
  const group = (ids: string[]) => ids.map((id) => byId.get(id)).filter((e): e is Email => Boolean(e));

  return (
    <div>
      {data && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="inline-flex items-center gap-1.5 text-sm text-muted">
            <Inbox className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            {data.truncated
              ? t("summary.truncated", { shown: data.count, total: data.totalEstimate })
              : t("summary.count", { count: data.count })}
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
        ) : data.summary ? (
          <div className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-headings:text-sm prose-headings:font-semibold prose-p:leading-relaxed prose-li:my-0.5">
            {/* The summary is model output over attacker-written emails: raw
                HTML is skipped and links/images are rendered as their text
                only, so an injected prompt can't plant a phishing link or a
                data-exfiltrating image URL. */}
            <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={["a", "img"]} unwrapDisallowed>
              {data.summary}
            </ReactMarkdown>
          </div>
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
          <p className="mt-2 text-xs text-muted">
            {t(`summary.ai.${data.aiStatus}`, { time: data.aiResetsAt ? formatResetTime(data.aiResetsAt, locale) : "" })}
          </p>
          {data.summary && (
            <details className="mt-4 rounded-2xl border border-border bg-surface px-5 py-3">
              <summary className="tap-h flex cursor-pointer items-center text-sm font-medium">
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
