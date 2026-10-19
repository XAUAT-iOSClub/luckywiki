"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localizeHref, stripLocaleFromPathname } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";

export function AdminHeader() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useT();
  const adminPath = stripLocaleFromPathname(pathname);
  const paths = adminPath.split("/").filter(Boolean);
  const breadcrumbLabels: Record<string, string> = {
    admin: t.common.admin,
    articles: t.common.articles,
    comments: t.common.comments,
    logs: t.common.logs,
    taxonomy: t.common.taxonomy,
    users: t.common.contributors,
    "mcp-keys": "MCP Keys",
    new: t.common.create,
    history: t.admin.revisionHistory.history,
    settings: t.common.settings,
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 items-center gap-1.5">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="flex-nowrap text-[12.5px]">
            <BreadcrumbItem>
              <BreadcrumbLink href={localizeHref(locale, "/admin")}>
                {t.common.admin}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {paths.slice(1).map((path, index) => {
              const href = localizeHref(locale, `/${paths.slice(0, index + 2).join("/")}`);
              const isLast = index === paths.length - 2;
              const idLike = /^[a-z0-9]{20,}$/i.test(path);
              const fallback = idLike
                ? t.admin.editArticle
                : path.charAt(0).toUpperCase() + path.slice(1);
              const label = breadcrumbLabels[path] ?? fallback;

              return (
                <React.Fragment key={href}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className={isLast ? "min-w-0" : undefined}>
                    {isLast ? (
                      <BreadcrumbPage className="max-w-[220px] truncate">
                        {label}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink className="max-w-[180px] truncate" href={href}>
                        {label}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <Button asChild className="shrink-0" size="sm" variant="ghost">
        <Link href={localizeHref(locale, "/wiki/home")}>
          <span className="hidden sm:inline">{t.common.viewWiki}</span>
          <ExternalLink data-icon="inline-end" />
        </Link>
      </Button>
    </header>
  );
}
