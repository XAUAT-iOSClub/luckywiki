import { notFound } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { listPublishedArticleTreeData } from "@/lib/articles";
import type { Locale } from "@/lib/i18n/config";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { canAccessAdminShell } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { buildWikiTree } from "@/lib/wiki/tree";

export async function WikiShell({
  lang,
  section,
  children,
}: {
  lang: string;
  section: "articles" | "agent" | "settings" | "search";
  children: React.ReactNode;
}) {
  if (!hasLocale(lang)) {
    notFound();
  }

  const locale: Locale = lang;
  const [treeArticles, session, dictionary] = await Promise.all([
    listPublishedArticleTreeData(),
    getCurrentSession(),
    getDictionary(locale),
  ]);

  const tree = buildWikiTree(treeArticles);
  const isAdmin = canAccessAdminShell(session?.user ?? null);
  const breadcrumbLabel =
    section === "agent"
      ? dictionary.agent.breadcrumb
      : section === "settings"
        ? dictionary.common.settings
        : section === "search"
          ? dictionary.common.search
          : dictionary.wiki.articlesBreadcrumb;

  return (
    <SidebarProvider>
      <WikiSidebar tree={tree} user={session?.user} isAdmin={isAdmin} />
      <SidebarInset className="m-0! min-h-svh">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border/5 px-4 sticky top-0 z-20 bg-background/50 backdrop-blur-md transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 justify-center">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={localizeHref(locale, "/wiki")}>
                    {dictionary.metadata.wiki}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
