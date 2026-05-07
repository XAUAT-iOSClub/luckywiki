"use client";

import * as React from "react";
import {
  BookOpen,
  FolderTree,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Sun,
  Users,
  View,
} from "lucide-react";

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
import { useTheme } from "next-themes";
import Link from "next/link";

const data = {
  user: {
    name: "Admin",
    email: "admin@luckywiki.com",
    image: null,
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/admin",
      icon: LayoutDashboard,
    },
    {
      title: "Articles",
      url: "/admin/articles",
      icon: FileText,
      items: [
        {
          title: "All Articles",
          url: "/admin/articles",
        },
        {
          title: "Drafts",
          url: "/admin/articles?status=DRAFT",
        },
        {
          title: "Published",
          url: "/admin/articles?status=PUBLISHED",
        },
      ],
    },
    {
      title: "Comments",
      url: "/admin/comments",
      icon: MessageSquare,
      items: [
        {
          title: "Pending",
          url: "/admin/comments?status=PENDING",
        },
        {
          title: "Approved",
          url: "/admin/comments?status=APPROVED",
        },
      ],
    },
    {
      title: "Taxonomy",
      url: "/admin/taxonomy",
      icon: FolderTree,
    },
    {
      title: "Contributors",
      url: "/admin/users",
      icon: Users,
    },
  ],
  secondaryNav: [
    {
      title: "View Wiki",
      url: "/wiki",
      icon: View,
    },
  ],
};

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: { name: string; email: string; image?: string | null };
}) {
  const { setTheme, theme } = useTheme();

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/admin">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <BookOpen className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-lg tracking-tight">LuckyWiki</span>
                  <span className="truncate text-xs opacity-70">Admin Control</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavMain items={data.secondaryNav} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              tooltip="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span>Toggle Theme</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
