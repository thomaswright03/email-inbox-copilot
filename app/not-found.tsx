import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import BrandHeader from "@/components/BrandHeader";
import { getTranslator } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getTranslator();
  return (
    <div className="flex min-h-screen flex-col">
      <BrandHeader appName={t("app.name")} />

      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="text-sm font-medium text-muted">404</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{t("notFound.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("notFound.body")}</p>
        <Link
          href="/"
          className="tap-h mt-6 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          {t("legal.back")}
        </Link>
      </main>
    </div>
  );
}
