import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, matchLocale, type Locale } from "./config";
import { createTranslator, MESSAGES } from "./index";

// The saved choice (cookie) wins; otherwise the browser's language.
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  return matchLocale((await headers()).get("accept-language"));
}

export async function getTranslator() {
  const locale = await getLocale();
  return { locale, t: createTranslator(locale, MESSAGES[locale]) };
}
