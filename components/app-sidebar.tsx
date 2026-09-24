"use client";

import * as React from "react";
import {
  Bot,
  FolderTree,
  FileText,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  ScrollText,
  Settings,
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
import Image from "next/image";

export function AppSidebar({
  user,
  siteName = "LuckyWiki",
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; image?: string | null; role?: string | null };
  siteName?: string;
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
          title: t.common.logs,
          url: localizeHref(locale, "/admin/logs"),
          icon: ScrollText,
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
        {
          title: "MCP Keys",
          url: localizeHref(locale, "/admin/mcp-keys"),
          icon: KeyRound,
        },
        {
          title: "Agent 控制",
          url: localizeHref(locale, "/admin/agent"),
          icon: Bot,
        }
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
        {
          title: "MCP Keys",
          url: localizeHref(locale, "/admin/mcp-keys"),
          icon: KeyRound,
        },
        {
          title: "Agent 控制",
          url: localizeHref(locale, "/admin/agent"),
          icon: Bot,
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
                <Image src="/favicon.png" alt={siteName} width={32} height={32} />
                <div className="grid flex-1 text-left text-sm leading-tight md:ml-1">
                  <span className="truncate font-semibold text-lg tracking-tight">{siteName}</span>
                  <span className="truncate text-xs opacity-70">{t.admin.control}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <React.Suspense fallback={null}>
          <NavMain items={navMain} label={t.common.platform}/>
        </React.Suspense>
        <React.Suspense fallback={null}>
          <NavMain items={secondaryNav} label={t.common.other} />
        </React.Suspense>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 group-data-[collapsible=icon]:hidden">
              <React.Suspense fallback={null}>
                <LocaleSwitcher className="w-full justify-center group-data-[collapsible=icon]:hidden" />
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
