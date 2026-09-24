import type { Locale } from "./config";
import { en, type Messages } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";

export const MESSAGES: Record<Locale, Messages> = { en, es, fr };
export { createTranslator, type Translate } from "./translate";
export type { MessageKey } from "./messages/en";
