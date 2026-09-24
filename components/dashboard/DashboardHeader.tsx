"use client";

import { signOut } from "next-auth/react";
import { LogOut, Sparkles } from "lucide-react";
import { PreferencesMenu } from "../Preferences";
import { useI18n } from "../I18nProvider";

export default function DashboardHeader({ userName }: { userName: string }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} aria-hidden />
          </div>
          <span className="truncate text-sm font-semibold tracking-tight">{t("app.name")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden max-w-40 truncate text-sm text-muted md:inline">{userName}</span>
          <PreferencesMenu />
          <button
            onClick={() => void signOut()}
            aria-label={t("header.signOut")}
            title={t("header.signOut")}
            className="tap-target flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            <LogOut className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
