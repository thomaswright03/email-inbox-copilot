"use client";

import Link from "next/link";
import { CONTACT_EMAIL } from "@/content/legal";
import { useI18n } from "../I18nProvider";

// mailto link for a copy or deletion request (Privacy Policy section 6).
// The signed code (lib/data-request.ts) lets the operator confirm the
// request is from this account. The email body stays in English because
// the operator reads it.
function dataRequestHref(kind: "copy" | "deletion", accountId: string, code: string | null): string {
  const subject = kind === "copy" ? "Inbox Buddy: copy of my data" : "Inbox Buddy: delete my data";
  const body = [
    kind === "copy" ? "Please send me a copy of the data you hold about me." : "Please delete the data you hold about me.",
    "",
    `Account id: ${accountId}`,
    `Request code: ${code ?? "(unavailable)"}`,
  ].join("\n");
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default function DataFooter({ accountId, dataRequestCode }: { accountId: string; dataRequestCode: string | null }) {
  const { t } = useI18n();
  return (
    <footer className="mx-auto max-w-2xl px-4 pb-6 text-xs text-muted">
      <div className="flex flex-wrap items-center gap-x-4">
        <Link href="/terms" target="_blank" className="tap-h inline-flex items-center hover:text-foreground">
          {t("legal.terms")}
        </Link>
        <Link href="/privacy" target="_blank" className="tap-h inline-flex items-center hover:text-foreground">
          {t("legal.privacy")}
        </Link>
      </div>
      <details className="mt-1">
        <summary className="tap-h inline-flex cursor-pointer items-center hover:text-foreground">{t("footer.yourData")}</summary>
        <p className="mt-1 leading-relaxed">
          {t("footer.accountId")} <span className="font-mono">{accountId}</span>. {t("footer.dataIntro")}{" "}
          <a href={dataRequestHref("copy", accountId, dataRequestCode)} className="underline hover:text-foreground">
            {t("footer.requestCopy")}
          </a>{" "}
          {t("footer.or")}{" "}
          <a href={dataRequestHref("deletion", accountId, dataRequestCode)} className="underline hover:text-foreground">
            {t("footer.requestDeletion")}
          </a>
          {t("footer.dataOutro")}
        </p>
      </details>
    </footer>
  );
}
