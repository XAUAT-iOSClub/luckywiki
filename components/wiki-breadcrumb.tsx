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
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";

export function WikiBreadcrumb({
  section,
}: {
  section: "articles" | "agent" | "settings";
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useT();

  const label = pathname.includes("/wiki/category")
    ? t.common.sections
    : pathname.includes("/wiki/tag")
      ? t.common.tags
      : section === "agent"
        ? t.agent.breadcrumb
        : section === "settings"
          ? t.common.settings
          : t.wiki.articlesBreadcrumb;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap text-[12.5px]">
        <BreadcrumbItem className="hidden sm:block">
          <BreadcrumbLink href={localizeHref(locale, "/wiki/home")}>
            {t.metadata.wiki}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden sm:block" />
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
