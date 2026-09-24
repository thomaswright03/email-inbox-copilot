import type { Metadata } from "next";
import { ShieldX } from "lucide-react";
import BrandHeader from "@/components/BrandHeader";
import { CONTACT_EMAIL } from "@/content/legal";
import { getTranslator } from "@/lib/i18n/server";
import AuthErrorActions from "./AuthErrorActions";

// Auth.js sends every failed sign-in here (auth.ts `pages.error`) with
// ?error=<type>. Only the known types get their own text.
const KNOWN = ["AccessDenied", "Verification", "Configuration"] as const;
type Known = (typeof KNOWN)[number];

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: `${t("auth.title.default")} · ${t("app.name")}` };
}

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const { t } = await getTranslator();
  const raw = (await searchParams).error;
  const type = typeof raw === "string" && (KNOWN as readonly string[]).includes(raw) ? (raw as Known) : null;
  const title = type ? t(`auth.title.${type}`) : t("auth.title.default");
  const body = type ? t(`auth.body.${type}`) : t("auth.body.default");

  return (
    <div className="flex min-h-screen flex-col">
      <BrandHeader appName={t("app.name")} />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-danger-soft">
            <ShieldX className="h-5 w-5 text-danger" strokeWidth={2} aria-hidden />
          </div>
          <h1 className="text-base font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          <p className="mt-3 text-sm text-muted">{t("auth.contact", { email: CONTACT_EMAIL })}</p>
          <AuthErrorActions
            primaryLabel={type === "AccessDenied" ? t("auth.tryDifferent") : t("auth.tryAgain")}
            chooseAccount={type === "AccessDenied"}
          />
        </div>
      </main>
    </div>
  );
}
