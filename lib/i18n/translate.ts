import type { Locale } from "./config";
import type { MessageKey, Messages } from "./messages/en";

export type Vars = Record<string, string | number>;
// "summary.count" for the pair "summary.count_one" / "summary.count_other".
export type PluralKey = { [K in MessageKey]: K extends `${infer Base}_one` ? Base : never }[MessageKey];
export type Translate = (key: MessageKey | PluralKey, vars?: Vars) => string;

// "{name}" placeholders are filled from vars. When vars.count is a number
// and "<key>_one" / "<key>_other" exist, the locale's plural rule picks one.
export function createTranslator(locale: Locale, messages: Messages): Translate {
  const plural = new Intl.PluralRules(locale);
  return (key, vars) => {
    let template: string | undefined = messages[key as MessageKey];
    if (vars && typeof vars.count === "number") {
      const form = `${key}_${plural.select(vars.count)}` as MessageKey;
      const other = `${key}_other` as MessageKey;
      template = messages[form] ?? messages[other] ?? template;
    }
    if (template === undefined) return key;
    return vars ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match)) : template;
  };
}
