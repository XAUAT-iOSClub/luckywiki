import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { WikiBreadcrumb } from "@/components/wiki-breadcrumb";
import { WikiSearchCommand } from "@/components/wiki-search-command";
import { WikiArticleHeaderActions } from "@/components/wiki-article-header-actions";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { SiteFooter } from "@/components/site-footer";
import { getSiteSettings } from "@/lib/site";
import { hasLocale } from "@/lib/i18n/config";
import { buildWikiTree } from "@/lib/wiki/tree";
import {
  WikiSidebarAccountSlot,
  WikiSidebarAdminSlot,
} from "@/components/wiki-sidebar-session";

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

  const [treeArticles, siteSettings] = await Promise.all([
    listPublishedArticleTreeData(),
    getSiteSettings(),
  ]);

  const tree = buildWikiTree(treeArticles);

  return (
    <SidebarProvider>
      <WikiSidebar
        tree={tree}
        siteName={siteSettings.siteName}
        adminSlot={<Suspense key="admin-navigation" fallback={null}><WikiSidebarAdminSlot /></Suspense>}
        accountSlot={<Suspense key="account-navigation" fallback={null}><WikiSidebarAccountSlot /></Suspense>}
      />
      <SidebarInset className="min-h-svh">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-3 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 h-4" />
            <WikiBreadcrumb section={section} />
          </div>
          <div className="flex items-center gap-1">
            {section === "articles" ? (
              <Suspense key="article-header-actions" fallback={null}>
                <WikiArticleHeaderActions />
              </Suspense>
            ) : null}
            <WikiSearchCommand className="md:hidden" compact />
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {section === "agent" ? null : <SiteFooter />}
      </SidebarInset>
    </SidebarProvider>
  );
}
