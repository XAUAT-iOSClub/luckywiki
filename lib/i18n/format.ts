import type { Locale } from "@/lib/i18n/config";
import { getIntlLocale } from "@/lib/i18n/config";

export function formatDate(
  locale: Locale,
  value: Date,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), options).format(value);
}

export function formatDateTime(
  locale: Locale,
  value: Date,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(value);
}

export function formatNumber(locale: Locale, value: number) {
  return new Intl.NumberFormat(getIntlLocale(locale)).format(value);
}

export function formatTemplate(
  template: string,
  values: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key] ?? ""));
}
