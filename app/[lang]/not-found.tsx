"use client";

import Link from "next/link";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";

export default function NotFound() {
  const locale = useLocale();
  const t = useT();

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-16">
      <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-8 text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.015em] text-balance">
          {t.notFound.title}
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
          {t.notFound.description}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            href={localizeHref(locale, "/wiki/home")}
          >
            {t.common.backToWiki}
          </Link>
          <Link
            className="inline-flex h-8 items-center justify-center rounded-md border border-border/70 bg-card px-3 text-[12.5px] font-medium text-foreground transition-colors hover:bg-muted"
            href={localizeHref(locale, "/admin/articles")}
          >
            {t.common.openAdmin}
          </Link>
        </div>
      </div>
    </main>
  );
}
