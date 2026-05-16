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
    new: t.common.create,
  };

  return (
    <header className="sticky top-0 z-20 bg-background/50 backdrop-blur-md flex h-16 shrink-0 items-center gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <div className="flex items-center">
          <Separator
            orientation="vertical"
            className="mr-2 h-4"
          />
        </div>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href={localizeHref(locale, "/admin")}>
                {t.common.admin}
              </BreadcrumbLink>
            </BreadcrumbItem>
            {paths.slice(1).map((path, index) => {
              const href = localizeHref(locale, `/${paths.slice(0, index + 2).join("/")}`);
              const isLast = index === paths.length - 2;
              const label = breadcrumbLabels[path] ?? path.charAt(0).toUpperCase() + path.slice(1);

              return (
                <React.Fragment key={href}>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={href}>{label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
