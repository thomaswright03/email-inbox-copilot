import { describe, it, expect } from "vitest";
import { LOCALES, matchLocale } from "../i18n/config";
import { createTranslator, MESSAGES } from "../i18n";

describe("message dictionaries", () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(LOCALES.filter((l) => l !== "en"))("%s uses the same placeholders as English for every key", (locale) => {
    for (const [key, english] of Object.entries(MESSAGES.en)) {
      const translated = MESSAGES[locale][key as keyof typeof MESSAGES.en];
      expect(translated, key).toBeTruthy();
      expect(placeholders(translated), key).toEqual(placeholders(english));
    }
  });
});

describe("createTranslator", () => {
  it("fills placeholders and leaves unknown ones as written", () => {
    const t = createTranslator("en", MESSAGES.en);
    expect(t("auth.contact", { email: "x@example.com" })).toBe("Questions? Contact x@example.com.");
    expect(t("auth.contact")).toContain("{email}");
  });

  it("picks the plural form by the locale's rule", () => {
    const en = createTranslator("en", MESSAGES.en);
    expect(en("summary.count", { count: 1 })).toMatch(/^1 message /);
    expect(en("summary.count", { count: 0 })).toMatch(/^0 messages /);
    // French treats 0 as singular.
    const fr = createTranslator("fr", MESSAGES.fr);
    expect(fr("summary.count", { count: 0 })).toMatch(/^0 message /);
    expect(fr("summary.count", { count: 2 })).toMatch(/^2 messages /);
  });

  it("writes numbers with each language's thousands separator", () => {
    const vars = { count: 1234, shown: 100, total: 1234 };
    expect(createTranslator("en", MESSAGES.en)("summary.count", vars)).toMatch(/^1,234 messages /);
    expect(createTranslator("es", MESSAGES.es)("summary.count", vars)).toMatch(/^1\.234 mensajes /);
    // French groups with a narrow no-break space.
    expect(createTranslator("fr", MESSAGES.fr)("summary.count", vars)).toMatch(/^1\u202f234 messages /);
    expect(createTranslator("en", MESSAGES.en)("summary.truncated", vars)).toBe(
      "Showing the newest 100 of about 1,234 messages from the last 24 hours"
    );
  });
});

describe("matchLocale", () => {
  it.each([
    [null, "en"],
    ["fr-CA,fr;q=0.9,en;q=0.8", "fr"],
    ["de-DE,es;q=0.5,en;q=0.4", "es"],
    ["en;q=0.2,es;q=0.9", "es"],
    ["de,it", "en"],
    ["fr;q=0", "en"],
  ])("%s -> %s", (header, expected) => {
    expect(matchLocale(header)).toBe(expected);
  });
});
