"use client";

import { createContext, useContext } from "react";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";

type I18nContextValue = {
  dictionary: Dictionary;
  locale: Locale;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  dictionary,
  locale,
}: Readonly<{
  children: React.ReactNode;
  dictionary: Dictionary;
  locale: Locale;
}>) {
  return (
    <I18nContext.Provider value={{ dictionary, locale }}>
      {children}
    </I18nContext.Provider>
  );
}

function useI18nContext() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("I18n context is not available.");
  }

  return context;
}

export function useLocale() {
  return useI18nContext().locale;
}

export function useT() {
  return useI18nContext().dictionary;
}
