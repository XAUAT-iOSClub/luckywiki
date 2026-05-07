import "server-only";

import type { Locale } from "@/lib/i18n/config";
import { en } from "@/lib/i18n/dictionaries/en";
import { zh } from "@/lib/i18n/dictionaries/zh";

export type Dictionary = typeof zh | typeof en;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  zh: async () => (await import("@/lib/i18n/dictionaries/zh")).zh,
  en: async () => (await import("@/lib/i18n/dictionaries/en")).en,
};

export function getDictionary(locale: Locale) {
  return dictionaries[locale]();
}
