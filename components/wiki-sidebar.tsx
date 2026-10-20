"use client";

import * as React from "react";
import {
  Bot,
  ChevronRight,
  FileText,
  Folder,
  FolderTree,
  ShieldCheck,
  Tags,
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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavUser } from "@/components/nav-user";
import { isNodeExpanded, type WikiTreeNode } from "@/lib/wiki/tree";
import { cn } from "@/lib/utils";
import { buildWikiHref, getWikiPathFromPathname } from "@/lib/wiki/path";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";
import { WikiSearchCommand } from "./wiki-search-command";
import Image from "next/image";

export function WikiSidebar({
  tree,
  siteName = "LuckyWiki",
  adminSlot,
  accountSlot,
}: {
  tree: WikiTreeNode;
  siteName?: string;
  adminSlot?: React.ReactNode;
  accountSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useT();
  const currentWikiPath = getWikiPathFromPathname(pathname);
  const isAgentRoute = pathname === localizeHref(locale, "/agent");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent group">
              <Link href={localizeHref(locale, "/wiki")}>
                <Image
                  alt={siteName}
                  className="size-7 shrink-0 rounded-md"
                  height={28}
                  src="/favicon.png"
                  width={28}
                />
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{siteName}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{t.wiki.knowledgeBase}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="mt-2 px-2 group-data-[collapsible=icon]:hidden">
          <WikiSearchCommand />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {adminSlot}

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{t.common.platform}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isAgentRoute} tooltip={t.common.agent}>
                <Link href={localizeHref(locale, "/agent")}>
                  <Bot className="size-4 text-muted-foreground" />
                  <span className="truncate">{t.common.agent}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
            {t.common.taxonomy}
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isPathInSection(pathname, localizeHref(locale, "/wiki/category"))}
                tooltip={t.common.sections}

              >
                <Link href={localizeHref(locale, "/wiki/category")}>
                  <FolderTree className="size-4 text-muted-foreground" />
                  <span className="truncate">{t.common.sections}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isPathInSection(pathname, localizeHref(locale, "/wiki/tag"))}
                tooltip={t.common.tags}

              >
                <Link href={localizeHref(locale, "/wiki/tag")}>
                  <Tags className="size-4 text-muted-foreground" />
                  <span className="truncate">{t.common.tags}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">{t.common.articles}</SidebarGroupLabel>
          <SidebarMenu>
            <TreeNav
              node={tree}
              currentPath={currentWikiPath}
            />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-1 px-2 group-data-[collapsible=icon]:hidden">
          <React.Suspense fallback={null}>
            <LocaleSwitcher className="w-auto justify-center" />
          </React.Suspense>
          <ThemeSwitcher />
        </div>
        {accountSlot}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

export function WikiSidebarAdminNavigation() {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useT();

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="group-data-[collapsible=icon]:hidden">
        {t.wiki.management}
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip={t.common.dashboard} isActive={pathname.startsWith(`/${locale}/admin`)}>
            <Link href={localizeHref(locale, "/admin")}>
              <ShieldCheck className="size-4" />
              <span className="truncate">{t.wiki.adminPanel}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

export function WikiSidebarAccount({
  user,
}: {
  user?: { name: string; email: string; image?: string | null } | null;
}) {
  const locale = useLocale();
  const t = useT();

  if (user) return <NavUser user={user} />;

  return (
    <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
      <Button asChild className="h-8 w-full" variant="outline">
        <Link href={localizeHref(locale, "/auth/sign-in")}>{t.common.signIn}</Link>
      </Button>
    </div>
  );
}

function isPathInSection(pathname: string, sectionPath: string) {
  return pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
}

function TreeNav({
  node,
  currentPath,
  forceExpanded = false,
}: {
  node: WikiTreeNode;
  currentPath: string;
  forceExpanded?: boolean;
}) {
  if (node.path === "" && node.children.length === 0) return null;

  if (node.path === "") {
    return (
      <>
        {node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            currentPath={currentPath}
            forceExpanded={forceExpanded}
          />
        ))}
      </>
    );
  }

  return <TreeItem node={node} currentPath={currentPath} forceExpanded={forceExpanded} />;
}

function TreeItem({
  node,
  currentPath,
  forceExpanded = false,
}: {
  node: WikiTreeNode;
  currentPath: string;
  forceExpanded?: boolean;
}) {
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
        <SidebarMenuButton asChild isActive={isActive} tooltip={node.label}>
          <Link href={href}>
            <FileText className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
            <span className={cn("truncate", isActive && "font-medium")}>{node.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible
      asChild
      className="group/collapsible"
      defaultOpen={forceExpanded ? undefined : isExpanded}
      open={forceExpanded ? true : undefined}
    >
      <SidebarMenuItem>
        {hasArticle ? (
          <SidebarMenuButton asChild isActive={isActive} tooltip={node.label}>
            <Link href={href}>
              <Folder className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("truncate", isActive && "font-medium")}>{node.label}</span>
            </Link>
          </SidebarMenuButton>
        ) : (
          <CollapsibleTrigger asChild>
            <SidebarMenuButton tooltip={node.label}>
              <Folder className="size-4 text-muted-foreground" />
              <span className="truncate">{node.label}</span>
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
          <SidebarMenuSub className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-2">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                currentPath={currentPath}
                forceExpanded={forceExpanded}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
