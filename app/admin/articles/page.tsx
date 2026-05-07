import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Filter, Plus, Search } from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { setArticleStatusAction } from "@/app/actions/admin";
import { listAdminTaxonomy } from "@/lib/admin";
import { listAdminArticles } from "@/lib/articles";
import { buildWikiHref } from "@/lib/wiki-path";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const statusOptions = [
  { label: "All statuses", value: "" },
  { label: "Draft", value: ArticleStatus.DRAFT },
  { label: "Published", value: ArticleStatus.PUBLISHED },
];

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const currentPage = Math.max(Number(getSingleParam(params, "page")) || 1, 1);
  const query = getSingleParam(params, "q")?.trim() ?? "";
  const statusValue = getSingleParam(params, "status");
  const tag = getSingleParam(params, "tag")?.trim() ?? "";
  const section = getSingleParam(params, "section")?.trim() ?? "";
  const status = Object.values(ArticleStatus).includes(statusValue as ArticleStatus)
    ? (statusValue as ArticleStatus)
    : undefined;
  const pageSize = 10;

  const [{ articles, totalCount, totalPages }, taxonomy] = await Promise.all([
    listAdminArticles({
      page: currentPage,
      pageSize,
      query,
      status,
      tag,
      section,
    }),
    listAdminTaxonomy(),
  ]);

  const activeFilterCount = [query, status, tag, section].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6">
      <section className="surface-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">Content Management</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Articles</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                Search by title and path, filter by status, tag, and section, and
                update publishing state without leaving the list.
              </p>
            </div>
          </div>
          <Button asChild className="rounded-full px-6">
            <Link href="/admin/articles/new">
              <Plus data-icon="inline-start" />
              New Article
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="Results"
          value={totalCount}
          detail={activeFilterCount > 0 ? `${activeFilterCount} active filters` : "All articles"}
        />
        <SummaryCard
          title="Drafts"
          value={taxonomy.sections.reduce((count, item) => count + item.draftArticles, 0)}
          detail="Across all sections"
        />
        <SummaryCard
          title="Published"
          value={taxonomy.sections.reduce((count, item) => count + item.publishedArticles, 0)}
          detail="Visible on the wiki"
        />
        <SummaryCard
          title="Tags"
          value={taxonomy.tags.length}
          detail={`${taxonomy.sections.length} sections in use`}
        />
      </section>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-5 text-primary" />
            Filter articles
          </CardTitle>
          <CardDescription>
            Combine structure and metadata filters to find exactly what needs work.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto]">
            <label className="field-block">
              <span>Search</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="field-input pl-10"
                  defaultValue={query}
                  name="q"
                  placeholder="Title, path, description, or exact tag"
                />
              </div>
            </label>
            <label className="field-block">
              <span>Status</span>
              <select className="field-input" defaultValue={status ?? ""} name="status">
                {statusOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>Tag</span>
              <select className="field-input" defaultValue={tag} name="tag">
                <option value="">All tags</option>
                {taxonomy.tags.slice(0, 100).map((item) => (
                  <option key={item.tag} value={item.tag}>
                    {item.tag}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>Section</span>
              <select className="field-input" defaultValue={section} name="section">
                <option value="">All sections</option>
                {taxonomy.sections.map((item) => (
                  <option key={item.slug || "root"} value={item.slug}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-3">
              <Button type="submit">Apply</Button>
              {activeFilterCount > 0 ? (
                <Button variant="outline" asChild>
                  <Link href="/admin/articles">Reset</Link>
                </Button>
              ) : null}
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            {status ? (
              <ActiveFilter href={buildArticleHref({ q: query, tag, section })}>
                status: {status.toLowerCase()}
              </ActiveFilter>
            ) : null}
            {tag ? (
              <ActiveFilter href={buildArticleHref({ q: query, status, section })}>
                tag: {tag}
              </ActiveFilter>
            ) : null}
            {section ? (
              <ActiveFilter href={buildArticleHref({ q: query, status, tag })}>
                section: {section}
              </ActiveFilter>
            ) : null}
            {query ? (
              <ActiveFilter href={buildArticleHref({ status, tag, section })}>
                search: {query}
              </ActiveFilter>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle>Article library</CardTitle>
          <CardDescription>
            {totalCount === 0
              ? "No articles match the current filters."
              : `Showing page ${currentPage} of ${Math.max(totalPages, 1)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {articles.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No articles matched your filters. Try broadening the search or create a new article.
            </div>
          ) : (
            articles.map((article) => {
              const targetStatus =
                article.status === ArticleStatus.PUBLISHED
                  ? ArticleStatus.DRAFT
                  : ArticleStatus.PUBLISHED;

              return (
                <article
                  key={article.id}
                  className="rounded-[1.75rem] border border-border/60 bg-muted/20 p-5"
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/articles/${article.id}`}
                          className="text-lg font-medium hover:text-primary"
                        >
                          {article.title}
                        </Link>
                        <Badge
                          variant={
                            article.status === ArticleStatus.PUBLISHED
                              ? "default"
                              : "secondary"
                          }
                        >
                          {article.status.toLowerCase()}
                        </Badge>
                        <Badge variant="outline">
                          {article._count.comments} comments
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        /{article.path}
                      </p>
                      {article.description ? (
                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                          {article.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((item) => (
                          <Link
                            key={item}
                            href={buildArticleHref({ q: query, status, section, tag: item })}
                          >
                            <Badge variant={item === tag ? "default" : "secondary"}>
                              {item}
                            </Badge>
                          </Link>
                        ))}
                        {article.tags.length === 0 ? (
                          <Badge variant="outline">untagged</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {article.author.name} · Updated {article.updatedAt.toLocaleString()}
                        {article.editor ? ` · ${article.editor}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:max-w-[320px] xl:justify-end">
                      <Button variant="outline" asChild>
                        <Link href={`/admin/articles/${article.id}`}>
                          Edit article
                        </Link>
                      </Button>
                      {article.status === ArticleStatus.PUBLISHED ? (
                        <Button variant="outline" asChild>
                          <Link href={buildWikiHref(article.path)} target="_blank">
                            <ExternalLink data-icon="inline-start" />
                            View live
                          </Link>
                        </Button>
                      ) : null}
                      <form action={setArticleStatusAction.bind(null, article.id, targetStatus)}>
                        <Button type="submit">
                          {article.status === ArticleStatus.PUBLISHED
                            ? "Move to draft"
                            : "Publish now"}
                        </Button>
                      </form>
                    </div>
                  </div>
                </article>
              );
            })
          )}

          {totalPages > 1 ? (
            <Pagination className="justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={
                      currentPage > 1
                        ? buildArticleHref({
                            q: query,
                            status,
                            tag,
                            section,
                            page: currentPage - 1,
                          })
                        : "#"
                    }
                    className={currentPage === 1 ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
                {buildPageNumbers(currentPage, totalPages).map((pageNumber, index) =>
                  pageNumber === "ellipsis" ? (
                    <PaginationItem key={`ellipsis-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        href={buildArticleHref({
                          q: query,
                          status,
                          tag,
                          section,
                          page: pageNumber,
                        })}
                        isActive={pageNumber === currentPage}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href={
                      currentPage < totalPages
                        ? buildArticleHref({
                            q: query,
                            status,
                            tag,
                            section,
                            page: currentPage + 1,
                          })
                        : "#"
                    }
                    className={
                      currentPage === totalPages ? "pointer-events-none opacity-40" : ""
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  detail,
}: {
  title: string;
  value: number;
  detail: string;
}) {
  return (
    <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function ActiveFilter({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href}>
      <Badge variant="secondary">{children} x</Badge>
    </Link>
  );
}

function getSingleParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildArticleHref({
  q,
  status,
  tag,
  section,
  page,
}: {
  q?: string;
  status?: ArticleStatus;
  tag?: string;
  section?: string;
  page?: number;
}) {
  const nextSearchParams = new URLSearchParams();

  if (q) {
    nextSearchParams.set("q", q);
  }
  if (status) {
    nextSearchParams.set("status", status);
  }
  if (tag) {
    nextSearchParams.set("tag", tag);
  }
  if (section) {
    nextSearchParams.set("section", section);
  }
  if (page && page > 1) {
    nextSearchParams.set("page", String(page));
  }

  const search = nextSearchParams.toString();
  return search ? `/admin/articles?${search}` : "/admin/articles";
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [
      1,
      "ellipsis",
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ] as const;
  }

  return [
    1,
    "ellipsis",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis",
    totalPages,
  ] as const;
}
