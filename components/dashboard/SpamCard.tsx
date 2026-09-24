"use client";

import { AlertTriangle, Check, ExternalLink, MailX, ShieldAlert, Trash2 } from "lucide-react";
import { gmailThreadUrl } from "@/lib/gmail-links";
import { initials, parseSender } from "@/lib/sender";
import type { SpamCardPayload } from "@/lib/payloads";
import { useI18n } from "../I18nProvider";
import { reconnectGmail, RECOVERY_LABEL, type Recovery } from "./States";

export type CardNotice = { kind: "error"; message: string; recovery: Recovery } | { kind: "finish"; message: string };

const BUTTON =
  "tap-h flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export default function SpamCard({
  card,
  accountEmail,
  pending,
  removing,
  notice,
  onDelete,
  onUnsubscribe,
  onOpenedUnsubscribe,
  onNotSpam,
}: {
  card: SpamCardPayload;
  accountEmail: string;
  pending: boolean;
  removing: boolean;
  notice: CardNotice | null;
  onDelete: () => void;
  onUnsubscribe: () => void;
  onOpenedUnsubscribe: (kind: "link" | "mailto") => void;
  onNotSpam: () => void;
}) {
  const { t } = useI18n();
  const { name, email } = parseSender(card.from);
  const unsubscribe = card.unsubscribe;

  return (
    <article
      aria-label={`${name}: ${card.subject}`}
      className={`rounded-2xl border border-border bg-surface p-4 transition-all duration-200 ${
        removing ? "scale-95 opacity-0" : "opacity-100 hover:border-foreground/15 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
        >
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={email}>
            {name}
          </p>
          <p className="truncate text-sm text-muted">{card.subject}</p>
        </div>
        <a
          href={gmailThreadUrl(card.threadId, accountEmail)}
          target="_blank"
          rel="noopener noreferrer"
          title={t("spam.openInGmail")}
          aria-label={t("summary.openInGmailAria", { subject: card.subject })}
          className="tap-target -mr-2 -mt-2 flex shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </a>
      </div>

      <p className="mt-3 line-clamp-2 text-xs text-muted">{card.snippet}</p>

      <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
        {t(`spam.reason.${card.reason}`)}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-2">
        <button
          onClick={onDelete}
          disabled={pending}
          className={`${BUTTON} bg-danger-soft text-danger hover:bg-danger hover:text-danger-foreground`}
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {pending ? t("spam.working") : t("spam.delete")}
        </button>

        {unsubscribe?.kind === "one-click" && (
          <button
            onClick={onUnsubscribe}
            disabled={pending}
            title={t("spam.unsubscribeHint")}
            className={`${BUTTON} bg-accent-soft text-accent hover:bg-accent hover:text-accent-foreground`}
          >
            <MailX className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {pending ? t("spam.working") : t("spam.unsubscribe")}
          </button>
        )}
        {(unsubscribe?.kind === "link" || unsubscribe?.kind === "mailto") && (
          <a
            href={unsubscribe.kind === "link" ? unsubscribe.url : unsubscribe.composeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onOpenedUnsubscribe(unsubscribe.kind)}
            title={t(unsubscribe.kind === "link" ? "spam.openUnsubscribePageHint" : "spam.emailToUnsubscribeHint")}
            className={`${BUTTON} bg-accent-soft text-accent hover:bg-accent hover:text-accent-foreground`}
          >
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {t(unsubscribe.kind === "link" ? "spam.openUnsubscribePage" : "spam.emailToUnsubscribe")}
          </a>
        )}

        <button
          onClick={onNotSpam}
          disabled={pending}
          title={t("spam.notSpamHint")}
          className={`${BUTTON} border border-border text-foreground hover:bg-surface-hover`}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("spam.notSpam")}
        </button>
      </div>

      {!unsubscribe && <p className="mt-2 text-[11px] text-muted">{t("spam.noUnsubscribe")}</p>}

      {notice?.kind === "finish" && (
        <p role="status" className="mt-2.5 text-xs text-muted">
          {notice.message}
        </p>
      )}
      {notice?.kind === "error" && (
        <div role="alert" className="mt-2.5 flex items-start gap-2 rounded-lg bg-danger-soft px-2.5 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span className="flex-1">{notice.message}</span>
          {notice.recovery !== "retry" && (
            <button onClick={reconnectGmail} className="shrink-0 font-medium underline underline-offset-2">
              {t(RECOVERY_LABEL[notice.recovery])}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
