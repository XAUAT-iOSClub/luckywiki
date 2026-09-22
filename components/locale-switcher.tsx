"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { localizeHref, locales } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentHref = `${pathname}${search ? `?${search}` : ""}`;

  return (
    <Tabs defaultValue={locale} suppressHydrationWarning className={cn("items-center gap-1 p-1", className)} onValueChange={(value) => {window.location.href = localizeHref(value as ('zh' | 'en'), currentHref);}}>
      <TabsList>
        {locales.map((targetLocale) => (
          <TabsTrigger
            key={targetLocale}
            value={targetLocale}
          >
            {t.common.localeName[targetLocale]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
