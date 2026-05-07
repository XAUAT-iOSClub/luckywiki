import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { WikiSidebar } from "@/components/wiki-sidebar";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { buildWikiTree } from "@/lib/wiki-tree";
import { getCurrentSession } from "@/lib/session";
import { canManageWiki } from "@/lib/permissions";
import { Separator } from "@/components/ui/separator";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export default async function WikiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [treeArticles, session] = await Promise.all([
    listPublishedArticleTreeData(),
    getCurrentSession(),
  ]);

  const tree = buildWikiTree(treeArticles);
  const isAdmin = canManageWiki(session?.user ?? null);

  return (
    <SidebarProvider>
      <WikiSidebar tree={tree} user={session?.user} isAdmin={isAdmin} />
      <SidebarInset className="bg-background/50 backdrop-blur-sm">
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12 border-b border-border/5 px-4 sticky top-0 z-10 bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/wiki">Wiki</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Articles</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
