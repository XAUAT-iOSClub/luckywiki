"use client";

import * as React from "react";
import {
  Bot,
  ChevronRight,
  FileText,
  Folder,
  Search,
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
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { NavUser } from "@/components/nav-user";
import { isNodeExpanded, type WikiTreeNode } from "@/lib/wiki/tree";
import { cn } from "@/lib/utils";
import { buildWikiHref, getWikiPathFromPathname } from "@/lib/wiki/path";
import { localizeHref } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/provider";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeSwitcher } from "./theme-switcher";

export function WikiSidebar({
  tree,
  user,
  isAdmin,
}: {
  tree: WikiTreeNode;
  user?: { name: string; email: string; image?: string | null } | null;
  isAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useT();
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const currentWikiPath = getWikiPathFromPathname(pathname);
  const isAgentRoute = pathname === localizeHref(locale, "/agent");
  const normalizedSearchQuery = normalizeSearchQuery(deferredSearchQuery);
  const filteredTree = normalizedSearchQuery
    ? filterWikiTree(tree, normalizedSearchQuery)
    : tree;
  const hasSearchResults = hasVisibleTreeNodes(filteredTree);

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r-0 bg-sidebar/40 backdrop-blur-xl">
      <SidebarHeader className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent group">
              <Link href={localizeHref(locale, "/wiki")}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-xl bg-primary transition-transform">
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
              aria-label={t.common.search}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchQuery.trim()) {
                  event.preventDefault();
                  router.push(
                    localizeHref(locale, `/search?q=${encodeURIComponent(searchQuery.trim())}`),
                  );
                }
              }}
              placeholder={t.wiki.searchPlaceholder}
              className="pl-9 h-10 rounded-xl bg-background/50 border-border/50 focus:bg-background transition-all focus-visible:ring-primary/20"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">{t.wiki.management}</SidebarGroupLabel>
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
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">{t.common.platform}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isAgentRoute} tooltip={t.common.agent} className="rounded-xl">
                <Link href={localizeHref(locale, "/agent")}>
                  <Bot className="size-4 text-muted-foreground" />
                  <span className="font-medium">{t.common.agent}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">{t.common.articles}</SidebarGroupLabel>
          <SidebarMenu>
            {hasSearchResults ? (
              <TreeNav
                node={filteredTree}
                currentPath={currentWikiPath}
                forceExpanded={normalizedSearchQuery.length > 0}
              />
            ) : (
              <SidebarMenuItem className="px-2 py-3 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                {t.wiki.noSearchResults}
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="py-4 px-2 space-y-2">
        <SidebarMenu className="group-data-[collapsible=icon]:hidden">
          <SidebarMenuItem>
            <div className="px-1">
              <React.Suspense fallback={null}>
                <LocaleSwitcher className="justify-center  w-full" />
              </React.Suspense>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ThemeSwitcher/>
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
    <Collapsible
      asChild
      className="group/collapsible"
      defaultOpen={forceExpanded ? undefined : isExpanded}
      open={forceExpanded ? true : undefined}
    >
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

function normalizeSearchQuery(query: string) {
  return query.trim().toLocaleLowerCase();
}

function matchesWikiTreeNode(node: WikiTreeNode, query: string) {
  return [node.label, node.articleTitle, node.path, node.segment]
    .filter((value): value is string => Boolean(value))
    .some((value) => value.toLocaleLowerCase().includes(query));
}

function filterWikiTree(node: WikiTreeNode, query: string): WikiTreeNode {
  const filteredChildren = node.children
    .map((child) => filterWikiTree(child, query))
    .filter((child) => child.articleTitle || child.children.length > 0);
  const matches = matchesWikiTreeNode(node, query);

  if (node.path === "") {
    return {
      ...node,
      children: filteredChildren,
    };
  }

  if (!matches && filteredChildren.length === 0) {
    return {
      ...node,
      articleTitle: undefined,
      children: [],
    };
  }

  return {
    ...node,
    children: matches && filteredChildren.length === 0 ? node.children : filteredChildren,
  };
}

function hasVisibleTreeNodes(node: WikiTreeNode) {
  if (node.path !== "") {
    return true;
  }

  return node.children.length > 0;
}
