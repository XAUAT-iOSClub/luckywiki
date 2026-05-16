"use client";

import * as React from "react";
import {
  BookOpen,
  FolderTree,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Users,
  View,
} from "lucide-react";
import { Role } from "@/generated/prisma/enums";

import { NavMain } from "@/components/nav-main";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; image?: string | null; role?: string | null };
}) {
  const locale = useLocale();
  const t = useT();
  const isRoot = user.role === Role.ROOT;
  const navMain = isRoot
    ? [
        {
          title: t.common.dashboard,
          url: localizeHref(locale, "/admin"),
          icon: LayoutDashboard,
        },
        {
          title: t.common.articles,
          url: localizeHref(locale, "/admin/articles"),
          icon: FileText,
          items: [
            {
              title: t.common.articles,
              url: localizeHref(locale, "/admin/articles"),
            },
            {
              title: t.common.draft,
              url: localizeHref(locale, "/admin/articles?status=DRAFT"),
            },
            {
              title: t.common.published,
              url: localizeHref(locale, "/admin/articles?status=PUBLISHED"),
            },
          ],
        },
        {
          title: t.common.comments,
          url: localizeHref(locale, "/admin/comments"),
          icon: MessageSquare,
          items: [
            {
              title: t.common.pending,
              url: localizeHref(locale, "/admin/comments?status=PENDING"),
            },
            {
              title: t.common.approved,
              url: localizeHref(locale, "/admin/comments?status=APPROVED"),
            },
          ],
        },
        {
          title: t.common.taxonomy,
          url: localizeHref(locale, "/admin/taxonomy"),
          icon: FolderTree,
        },
        {
          title: t.common.contributors,
          url: localizeHref(locale, "/admin/users"),
          icon: Users,
        },
      ]
    : [
        {
          title: t.common.articles,
          url: localizeHref(locale, "/admin/articles"),
          icon: FileText,
          items: [
            {
              title: t.common.articles,
              url: localizeHref(locale, "/admin/articles"),
            },
            {
              title: t.common.draft,
              url: localizeHref(locale, "/admin/articles?status=DRAFT"),
            },
            {
              title: t.common.published,
              url: localizeHref(locale, "/admin/articles?status=PUBLISHED"),
            },
          ],
        },
      ];
  const secondaryNav = [
    {
      title: t.common.viewWiki,
      url: localizeHref(locale, "/wiki/home"),
      icon: View,
    },
  ];

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href={localizeHref(locale, "/admin")}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BookOpen className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-lg tracking-tight">LuckyWiki</span>
                  <span className="truncate text-xs opacity-70">{t.admin.control}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <React.Suspense fallback={null}>
          <NavMain items={navMain} />
        </React.Suspense>
        <React.Suspense fallback={null}>
          <NavMain items={secondaryNav} />
        </React.Suspense>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2">
              <React.Suspense fallback={null}>
                <LocaleSwitcher className="w-full justify-center" />
              </React.Suspense>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="px-1 group-data-[collapsible=icon]:hidden">
              <ThemeSwitcher/>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
