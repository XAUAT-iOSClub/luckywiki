import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { buildWikiTree } from "@/lib/wiki-tree";
import { canManageWiki } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import { notFound } from "next/navigation";

type Params = Promise<{ lang: string }>;

export default async function WikiLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [treeArticles, session, dictionary] = await Promise.all([
    listPublishedArticleTreeData(),
    getCurrentSession(),
    getDictionary(lang),
  ]);

  const tree = buildWikiTree(treeArticles);
  const isAdmin = canManageWiki(session?.user ?? null);

  return (
    <SidebarProvider>
      <WikiSidebar tree={tree} user={session?.user} isAdmin={isAdmin} />
      <SidebarInset className="bg-background/50 backdrop-blur-sm min-h-svh">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b border-border/5 px-4 sticky top-0 z-20 bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={localizeHref(lang, "/wiki")}>
                    {dictionary.metadata.wiki}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{dictionary.wiki.articlesBreadcrumb}</BreadcrumbPage>
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
