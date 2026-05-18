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
import { WikiSearchCommand } from "@/components/wiki-search-command";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { SiteFooter } from "@/components/site-footer";
import { getSiteSettings } from "@/lib/site";
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
  section: "articles" | "agent" | "settings";
  children: React.ReactNode;
}) {
  if (!hasLocale(lang)) {
    notFound();
  }

  const locale: Locale = lang;
  const [treeArticles, session, dictionary, siteSettings] = await Promise.all([
    listPublishedArticleTreeData(),
    getCurrentSession(),
    getDictionary(locale),
    getSiteSettings(),
  ]);

  const tree = buildWikiTree(treeArticles);
  const isAdmin = canAccessAdminShell(session?.user ?? null);
  const breadcrumbLabel =
    section === "agent"
      ? dictionary.agent.breadcrumb
      : section === "settings"
        ? dictionary.common.settings
        : dictionary.wiki.articlesBreadcrumb;

  return (
    <SidebarProvider>
      <WikiSidebar tree={tree} user={session?.user} isAdmin={isAdmin} siteName={siteSettings.siteName} />
      <SidebarInset className="m-0! min-h-svh">
        <header className="sticky md:rounded-tl-2xl top-0 z-20 bg-background/50 backdrop-blur-md flex justify-between h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 ">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <div className="flex items-center">
              <Separator
                orientation="vertical"
                className="mr-2 h-4"
            />
            </div>
            <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href={localizeHref(locale, "/wiki/home")}>
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
          <div className="md:hidden items-center gap-2">
              <WikiSearchCommand className="md:w-40 lg:w-64" />
            </div>
        </header>
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </SidebarInset>
    </SidebarProvider>
  );
}
