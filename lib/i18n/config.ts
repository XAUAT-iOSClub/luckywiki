export const locales = ["zh", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "zh";
export const localeCookieName = "NEXT_LOCALE";

const intlLocaleMap: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en-US",
};

export function hasLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function getIntlLocale(locale: Locale) {
  return intlLocaleMap[locale];
}

export function getPathnameLocale(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment && hasLocale(segment) ? segment : null;
}

export function stripLocaleFromPathname(pathname: string) {
  const normalized = normalizePathname(pathname);
  const locale = getPathnameLocale(normalized);

  if (!locale) {
    return normalized;
  }

  const nextPath = normalized.slice(locale.length + 1);
  return nextPath ? normalizePathname(nextPath) : "/";
}

export function localizeHref(locale: Locale, href: string) {
  const [pathAndSearch, hash = ""] = href.split("#");
  const [pathname = "/", search = ""] = pathAndSearch.split("?");
  const normalizedPath = stripLocaleFromPathname(normalizePathname(pathname));
  const localizedPath = normalizedPath === "/" ? `/${locale}` : `/${locale}${normalizedPath}`;

  return `${localizedPath}${search ? `?${search}` : ""}${hash ? `#${hash}` : ""}`;
}

export function getPreferredLocale(acceptLanguage?: string | null) {
  if (!acceptLanguage) {
    return defaultLocale;
  }

  const tokens = acceptLanguage.split(",");

  for (const token of tokens) {
    const value = token.split(";")[0]?.trim().toLowerCase();

    if (!value) {
      continue;
    }

    if (value === "zh" || value.startsWith("zh-")) {
      return "zh";
    }

    if (value === "en" || value.startsWith("en-")) {
      return "en";
    }
  }

  return defaultLocale;
}

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}
