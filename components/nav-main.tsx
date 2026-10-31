"use client";

import { ChevronRight, type LucideIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/provider";

export function NavMain({
  items,
  label
}: {
  items: {
    title: string;
    url: string;
    icon?: LucideIcon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
  label: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentQuery = searchParams.toString();
  const t = useT();
  const activeItemUrl = findActiveItemUrl(items, pathname, currentQuery);

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const subItems = item.items ?? [];
          const activeSubUrl = subItems.length
            ? findActiveSubUrl(pathname, currentQuery, subItems)
            : null;
          // 命中子项时父项让位（子项与父项同路径时也能区分当前筛选状态）
          const isActive =
            item.url === activeItemUrl &&
            (activeSubUrl === null || activeSubUrl === item.url);
          const defaultOpen = isActive || activeSubUrl !== null;

          if (!item.items) {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <Collapsible key={item.title} asChild defaultOpen={defaultOpen}>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
                {item.items?.length ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="data-[state=open]:rotate-90">
                        <ChevronRight />
                        <span className="sr-only">{t.common.toggle}</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={subItem.url === activeSubUrl}
                            >
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function findActiveItemUrl(
  items: { url: string }[],
  pathname: string,
  currentQuery: string
) {
  // A parent route such as /admin is a prefix of every child route, so pick the
  // most specific match instead of marking both the parent and the child active.
  let activeUrl: string | null = null;
  let activePathLength = -1;

  for (const item of items) {
    if (!matchesNavLink(pathname, currentQuery, item.url)) continue;

    const pathLength = item.url.split("?")[0].length;
    if (pathLength > activePathLength) {
      activeUrl = item.url;
      activePathLength = pathLength;
    }
  }

  return activeUrl;
}

function findActiveSubUrl(
  pathname: string,
  currentQuery: string,
  subItems: { url: string }[],
) {
  const current = new URLSearchParams(currentQuery);
  let fallback: string | null = null;

  for (const subItem of subItems) {
    const [targetPath, targetQuery = ""] = subItem.url.split("?");

    if (targetQuery) {
      if (pathname !== targetPath) continue;

      // 右侧筛选栏点「应用」后 URL 会带上 q/tag/section 等额外参数，
      // 只要目标参数全部成立即视为命中，否则左侧永远无法跟随筛选结果高亮。
      const target = new URLSearchParams(targetQuery);
      let matched = true;

      for (const [key, value] of target) {
        if (current.get(key) !== value) {
          matched = false;
          break;
        }
      }

      if (matched) return subItem.url;
      continue;
    }

    if (fallback === null && matchesNavLink(pathname, currentQuery, subItem.url)) {
      fallback = subItem.url;
    }
  }

  return fallback;
}

function matchesNavLink(pathname: string, currentQuery: string, href: string) {
  const [targetPath, targetQuery = ""] = href.split("?");

  if (targetQuery) {
    return pathname === targetPath && currentQuery === targetQuery;
  }

  return pathname === targetPath || pathname.startsWith(targetPath + "/");
}
