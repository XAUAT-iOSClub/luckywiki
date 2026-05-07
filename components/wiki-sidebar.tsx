"use client";

import * as React from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  Moon,
  Search,
  Settings,
  Sun,
  ShieldCheck,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarInput,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavUser } from "@/components/nav-user";
import { isNodeExpanded, type WikiTreeNode } from "@/lib/wiki-tree";
import { cn } from "@/lib/utils";
import { buildWikiHref, getWikiPathFromPathname } from "@/lib/wiki-path";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { LocaleSwitcher } from "@/components/locale-switcher";

export function WikiSidebar({
  tree,
  user,
  isAdmin,
}: {
  tree: WikiTreeNode;
  user?: { name: string; email: string; image?: string | null } | null;
  isAdmin?: boolean;
}) {
  const { setTheme, theme } = useTheme();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useT();
  const currentWikiPath = getWikiPathFromPathname(pathname);

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r-0 bg-sidebar/40 backdrop-blur-xl">
      <SidebarHeader className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent group">
              <Link href={localizeHref(locale, "/wiki")}>
                <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105 group-active:scale-95">
                  <FileText className="size-5 text-primary-foreground" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight ml-2">
                  <span className="truncate font-bold text-lg tracking-tight">LuckyWiki</span>
                  <span className="truncate text-xs opacity-60 font-medium">{t.wiki.knowledgeBase}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        <div className="px-2 mt-4 group-data-[collapsible=icon]:hidden">
          <div className="relative group/search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within/search:text-primary" />
            <SidebarInput 
              placeholder={t.wiki.searchPlaceholder} 
              className="pl-9 h-10 rounded-xl bg-background/50 border-border/50 focus:bg-background transition-all focus-visible:ring-primary/20"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">{t.wiki.management}</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={t.common.dashboard} isActive={pathname.startsWith(`/${locale}/admin`)}>
                  <Link href={localizeHref(locale, "/admin")} className="rounded-xl">
                    <ShieldCheck className="size-4" />
                    <span className="font-medium">{t.wiki.adminPanel}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">{t.common.articles}</SidebarGroupLabel>
          <SidebarMenu>
            <TreeNav node={tree} currentPath={currentWikiPath} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="py-4 px-2 space-y-2">
        <SidebarMenu className="group-data-[collapsible=icon]:hidden">
          <SidebarMenuItem>
            <div className="px-1">
              <LocaleSwitcher className="w-full justify-center" />
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              tooltip={t.common.appearance}
              className="rounded-xl"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="font-medium">{t.common.appearance}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t.common.settings} className="rounded-xl">
              <Settings className="size-4" />
              <span className="font-medium">{t.common.settings}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        {user ? (
          <NavUser user={user} />
        ) : (
          <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
            <Button asChild variant="outline" className="w-full h-11 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm shadow-sm hover:bg-background transition-all">
              <Link href={localizeHref(locale, "/auth/sign-in")}>{t.common.signIn}</Link>
            </Button>
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function TreeNav({ node, currentPath }: { node: WikiTreeNode; currentPath: string }) {
  if (node.path === "" && node.children.length === 0) return null;

  if (node.path === "") {
    return (
      <>
        {node.children.map((child) => (
          <TreeItem key={child.path} node={child} currentPath={currentPath} />
        ))}
      </>
    );
  }

  return <TreeItem node={node} currentPath={currentPath} />;
}

function TreeItem({ node, currentPath }: { node: WikiTreeNode; currentPath: string }) {
  const locale = useLocale();
  const t = useT();
  const href = buildWikiHref(node.path, locale);
  const isActive = currentPath === node.path;
  const isExpanded = isNodeExpanded(node.path, currentPath);
  const hasChildren = node.children.length > 0;
  const hasArticle = !!node.articleTitle;

  if (!hasChildren) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive} tooltip={node.label} className="rounded-xl">
          <Link href={href}>
            <FileText className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
            <span className={cn(isActive && "font-semibold")}>{node.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible asChild defaultOpen={isExpanded} className="group/collapsible">
      <SidebarMenuItem>
        {hasArticle ? (
          <SidebarMenuButton asChild isActive={isActive} tooltip={node.label} className="rounded-xl">
            <Link href={href}>
              <Folder className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className={cn(isActive && "font-semibold")}>{node.label}</span>
            </Link>
          </SidebarMenuButton>
        ) : (
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={node.label} className="rounded-xl">
              <Folder className="size-4 text-muted-foreground" />
              <span>{node.label}</span>
            </SidebarMenuButton>
          </CollapsibleTrigger>
        )}
        
        {hasArticle ? (
          <CollapsibleTrigger asChild>
            <SidebarMenuAction className="left-auto right-1 data-[state=open]:rotate-90 rounded-md transition-transform hover:bg-sidebar-accent">
              <ChevronRight className="size-4" />
              <span className="sr-only">{t.common.toggle}</span>
            </SidebarMenuAction>
          </CollapsibleTrigger>
        ) : (
          <SidebarMenuAction className="left-auto right-1 data-[state=open]:rotate-90 rounded-md transition-transform pointer-events-none">
            <ChevronRight className="size-4" />
            <span className="sr-only">{t.common.toggle}</span>
          </SidebarMenuAction>
        )}

        <CollapsibleContent>
          <SidebarMenuSub className="border-l-0 ml-4 pl-2 space-y-1 mt-1 border-l border-border/10">
            {node.children.map((child) => (
              <TreeItem key={child.path} node={child} currentPath={currentPath} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
