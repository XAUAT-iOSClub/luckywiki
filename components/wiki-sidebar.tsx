"use client";

import * as React from "react";
import {
  ChevronRight,
  FileText,
  Folder,
  LayoutDashboard,
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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
  const currentWikiPath = pathname.replace("/wiki/", "").replace("/wiki", "");

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-r-0 bg-sidebar/40 backdrop-blur-xl">
      <SidebarHeader className="py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent group">
              <Link href="/wiki">
                <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105 group-active:scale-95">
                  <FileText className="size-5 text-primary-foreground" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight ml-2">
                  <span className="truncate font-bold text-lg tracking-tight">LuckyWiki</span>
                  <span className="truncate text-xs opacity-60 font-medium">Knowledge Base</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        <div className="px-2 mt-4 group-data-[collapsible=icon]:hidden">
          <div className="relative group/search">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within/search:text-primary" />
            <SidebarInput 
              placeholder="Search..." 
              className="pl-9 h-10 rounded-xl bg-background/50 border-border/50 focus:bg-background transition-all focus-visible:ring-primary/20"
            />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">Management</SidebarGroupLabel>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Dashboard" isActive={pathname.startsWith("/admin")}>
                  <Link href="/admin" className="rounded-xl">
                    <ShieldCheck className="size-4" />
                    <span className="font-medium">Admin Panel</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] uppercase tracking-widest font-bold opacity-40 group-data-[collapsible=icon]:hidden">Articles</SidebarGroupLabel>
          <SidebarMenu>
            <TreeNav node={tree} currentPath={currentWikiPath} />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="py-4 px-2 space-y-2">
        <SidebarMenu className="group-data-[collapsible=icon]:hidden">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              tooltip="Appearance"
              className="rounded-xl"
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="font-medium">Appearance</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" className="rounded-xl">
              <Settings className="size-4" />
              <span className="font-medium">Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        {user ? (
          <NavUser user={user} />
        ) : (
          <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
            <Button asChild variant="outline" className="w-full h-11 rounded-xl border-border/50 bg-background/50 backdrop-blur-sm shadow-sm hover:bg-background transition-all">
              <Link href="/auth/sign-in">Sign In</Link>
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
  const href = `/wiki${node.path ? `/${node.path}` : ""}`;
  const isActive = currentPath === node.path;
  const isExpanded = isNodeExpanded(node.path, currentPath);
  const hasChildren = node.children.length > 0;

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
        <SidebarMenuButton asChild isActive={isActive} tooltip={node.label} className="rounded-xl">
          <Link href={href}>
            <Folder className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
            <span className={cn(isActive && "font-semibold")}>{node.label}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsibleTrigger asChild>
          <SidebarMenuAction className="left-auto right-1 data-[state=open]:rotate-90 rounded-md transition-transform hover:bg-sidebar-accent">
            <ChevronRight className="size-4" />
            <span className="sr-only">Toggle</span>
          </SidebarMenuAction>
        </CollapsibleTrigger>
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
