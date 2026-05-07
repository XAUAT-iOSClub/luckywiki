import Link from "next/link";
import { Plus, ExternalLink, Edit3, MessageSquare, MoreHorizontal } from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { buildWikiHref } from "@/lib/wiki-path";
import { listAdminArticles } from "@/lib/articles";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ page?: string }>;

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const pageSize = 10;
  
  const { articles, totalCount, totalPages } = await listAdminArticles({ 
    page: currentPage, 
    pageSize 
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-primary tracking-wide uppercase opacity-80">Content Management</p>
          <h1 className="text-3xl font-bold tracking-tight">Articles</h1>
        </div>
        <Button asChild className="rounded-full px-6 shadow-md hover:shadow-lg transition-all duration-300">
          <Link href="/admin/articles/new">
            <Plus className="mr-2 h-4 w-4" />
            New Article
          </Link>
        </Button>
      </div>

      <div className="group rounded-[2rem] border border-border/50 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-xl overflow-hidden shadow-sm transition-all duration-500 hover:shadow-md hover:border-border/80">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border/50 bg-zinc-50/50 dark:bg-zinc-800/30">
              <TableHead className="py-5 px-6 font-semibold">Title</TableHead>
              <TableHead className="py-5 font-semibold">Path</TableHead>
              <TableHead className="py-5 font-semibold">Status</TableHead>
              <TableHead className="py-5 font-semibold hidden lg:table-cell">Author</TableHead>
              <TableHead className="py-5 text-center font-semibold">
                <MessageSquare className="h-4 w-4 mx-auto opacity-50" />
              </TableHead>
              <TableHead className="py-5 font-semibold hidden md:table-cell">Updated</TableHead>
              <TableHead className="py-5 px-6 text-right font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {articles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No articles found. Create your first article to get started.
                </TableCell>
              </TableRow>
            ) : (
              articles.map((article) => (
                <TableRow key={article.id} className="group/row border-border/40 hover:bg-zinc-100/30 dark:hover:bg-zinc-800/50 transition-colors">
                  <TableCell className="py-4 px-6">
                    <Link 
                      href={`/admin/articles/${article.id}`}
                      className="font-semibold text-foreground hover:text-primary transition-colors block decoration-primary/30 hover:underline underline-offset-4"
                    >
                      {article.title}
                    </Link>
                  </TableCell>
                  <TableCell className="py-4 font-mono text-[11px] text-muted-foreground">
                    <span className="bg-muted px-2 py-0.5 rounded-md">{article.path || "/"}</span>
                  </TableCell>
                  <TableCell className="py-4">
                    <Badge 
                      variant={article.status === ArticleStatus.PUBLISHED ? "default" : "secondary"}
                      className={cn(
                        "rounded-full px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                        article.status === ArticleStatus.PUBLISHED 
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20" 
                          : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-500/20 border-zinc-500/20"
                      )}
                    >
                      {article.status.toLowerCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-4 text-sm text-muted-foreground hidden lg:table-cell">
                    {article.author.name}
                  </TableCell>
                  <TableCell className="py-4 text-center text-sm font-medium">
                    {article._count.comments > 0 ? (
                      <span className="inline-flex items-center justify-center bg-primary/10 text-primary rounded-full w-6 h-6 text-[10px] font-bold ring-1 ring-primary/20">
                        {article._count.comments}
                      </span>
                    ) : (
                      <span className="opacity-20">0</span>
                    )}
                  </TableCell>
                  <TableCell className="py-4 text-xs text-muted-foreground hidden md:table-cell">
                    {article.updatedAt.toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </TableCell>
                  <TableCell className="py-4 px-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" asChild className="rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 hover:bg-primary/10 hover:text-primary">
                        <Link href={`/admin/articles/${article.id}`} title="Edit Article">
                          <Edit3 className="h-4 w-4" />
                        </Link>
                      </Button>
                      
                      {article.status === ArticleStatus.PUBLISHED && (
                        <Button variant="ghost" size="icon-sm" asChild className="rounded-full opacity-0 group-hover/row:opacity-100 transition-opacity duration-200 hover:bg-primary/10 hover:text-primary">
                          <Link href={buildWikiHref(article.path)} target="_blank" title="View Live">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" className="rounded-full hover:bg-muted">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-2xl p-2 min-w-40 shadow-xl border-border/40 backdrop-blur-xl">
                          <DropdownMenuItem asChild className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer">
                            <Link href={`/admin/articles/${article.id}`}>
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit Details
                            </Link>
                          </DropdownMenuItem>
                          {article.status === ArticleStatus.PUBLISHED && (
                            <DropdownMenuItem asChild className="rounded-xl focus:bg-primary/10 focus:text-primary cursor-pointer">
                              <Link href={buildWikiHref(article.path)} target="_blank">
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View Public Page
                              </Link>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="border-t border-border/40 bg-zinc-50/30 dark:bg-zinc-800/20 px-6 py-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-medium">
              Showing <span className="text-foreground">{(currentPage - 1) * pageSize + 1}</span> to <span className="text-foreground">{Math.min(currentPage * pageSize, totalCount)}</span> of <span className="text-foreground">{totalCount}</span> articles
            </p>
            <Pagination className="justify-end w-auto mx-0">
              <PaginationContent className="gap-1">
                <PaginationItem>
                  <PaginationPrevious 
                    href={currentPage > 1 ? `/admin/articles?page=${currentPage - 1}` : "#"} 
                    className={cn(
                      "rounded-xl hover:bg-primary/10 hover:text-primary transition-colors",
                      currentPage === 1 && "pointer-events-none opacity-40"
                    )}
                  />
                </PaginationItem>
                
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                  // Basic pagination logic to show current, first, last and neighbors
                  if (totalPages > 5 && p !== 1 && p !== totalPages && Math.abs(p - currentPage) > 1) {
                    if (p === 2 || p === totalPages - 1) return <PaginationItem key={p}><PaginationEllipsis /></PaginationItem>;
                    return null;
                  }

                  return (
                    <PaginationItem key={p}>
                      <PaginationLink 
                        href={`/admin/articles?page=${p}`} 
                        isActive={p === currentPage}
                        className={cn(
                          "rounded-xl transition-all duration-200",
                          p === currentPage 
                            ? "bg-primary text-primary-foreground shadow-sm scale-110" 
                            : "hover:bg-primary/10 hover:text-primary"
                        )}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                <PaginationItem>
                  <PaginationNext 
                    href={currentPage < totalPages ? `/admin/articles?page=${currentPage + 1}` : "#"} 
                    className={cn(
                      "rounded-xl hover:bg-primary/10 hover:text-primary transition-colors",
                      currentPage === totalPages && "pointer-events-none opacity-40"
                    )}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </div>
  );
}
