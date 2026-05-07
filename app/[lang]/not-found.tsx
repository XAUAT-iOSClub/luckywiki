"use client";

import Link from "next/link";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";

export default function NotFound() {
  const locale = useLocale();
  const t = useT();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="surface-panel max-w-xl space-y-5 text-center">
        <p className="eyebrow">404</p>
        <h1 className="text-3xl font-semibold text-balance">{t.notFound.title}</h1>
        <p className="text-sm leading-7 text-muted-foreground">
          {t.notFound.description}
        </p>
        <div className="flex justify-center gap-3">
          <Link className="button-primary" href={localizeHref(locale, "/wiki/home")}>
            {t.common.backToWiki}
          </Link>
          <Link className="button-secondary" href={localizeHref(locale, "/admin/articles")}>
            {t.common.openAdmin}
          </Link>
        </div>
      </div>
    </main>
  );
}
