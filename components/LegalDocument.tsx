import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BrandHeader from "./BrandHeader";
import { getTranslator } from "@/lib/i18n/server";

// The legal documents are English only (lib/i18n/config.ts); other
// languages get a note saying so.
export default async function LegalDocument({ title, content }: { title: string; content: string }) {
  const { t, locale } = await getTranslator();
  return (
    <div className="min-h-screen">
      <BrandHeader appName={t("app.name")} />

      <main className="mx-auto max-w-2xl px-4 py-8">
        {locale !== "en" && (
          <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{t("legal.englishOnly")}</p>
        )}
        <h1 lang="en" className="mb-6 text-xl font-semibold tracking-tight">
          {title}
        </h1>
        <div lang="en" className="prose prose-sm prose-zinc dark:prose-invert max-w-none prose-headings:font-semibold prose-a:text-accent">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      </main>
    </div>
  );
}
