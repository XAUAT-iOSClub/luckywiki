"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { localizeHref, locales } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const currentHref = `${pathname}${search ? `?${search}` : ""}`;

  return (
    <div
      aria-label={t.common.language}
      className={cn("inline-flex items-center gap-1 rounded-xl border border-border/50 bg-background/60 p-1", className)}
      role="group"
    >
      {locales.map((targetLocale) => {
        const isActive = locale === targetLocale;

        return (
          <Link
            key={targetLocale}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            href={localizeHref(targetLocale, currentHref)}
          >
            {t.common.localeName[targetLocale]}
          </Link>
        );
      })}
    </div>
  );
}
