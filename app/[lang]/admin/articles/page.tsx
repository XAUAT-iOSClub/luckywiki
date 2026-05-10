import type { ReactNode } from "react";
import Link from "next/link";
import { ExternalLink, Filter, Plus, Search } from "lucide-react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { setArticleStatusAction } from "@/app/actions/admin";
import { listAdminTaxonomy } from "@/lib/admin";
import { listAdminArticles } from "@/lib/articles";
import { buildWikiHref } from "@/lib/wiki/path";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { formatDateTime, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { notFound } from "next/navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

export default async function AdminArticlesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const dictionary = await getDictionary(lang);
  const statusOptions = [
    { label: dictionary.common.allStatuses, value: "" },
    { label: dictionary.common.draft, value: ArticleStatus.DRAFT },
    { label: dictionary.common.published, value: ArticleStatus.PUBLISHED },
  ];
  const paramsObject = await searchParams;
  const currentPage = Math.max(Number(getSingleParam(paramsObject, "page")) || 1, 1);
  const query = getSingleParam(paramsObject, "q")?.trim() ?? "";
  const statusValue = getSingleParam(paramsObject, "status");
  const tag = getSingleParam(paramsObject, "tag")?.trim() ?? "";
  const section = getSingleParam(paramsObject, "section")?.trim() ?? "";
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
            <p className="eyebrow">{dictionary.admin.articleLibrary}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">{dictionary.common.articles}</h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {dictionary.admin.filterArticlesDescription}
              </p>
            </div>
          </div>
          <Button asChild className="rounded-full px-6">
            <Link href={localizeHref(lang, "/admin/articles/new")}>
              <Plus data-icon="inline-start" />
              {dictionary.admin.createArticle}
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          detail={
            activeFilterCount > 0
              ? formatTemplate(dictionary.admin.metrics.activeFilters, {
                  count: formatNumber(lang, activeFilterCount),
                })
              : dictionary.admin.metrics.allArticles
          }
          title={dictionary.admin.metrics.results}
          value={totalCount}
        />
        <SummaryCard
          detail={dictionary.admin.metrics.acrossAllSections}
          title={dictionary.admin.metrics.drafts}
          value={taxonomy.sections.reduce((count, item) => count + item.draftArticles, 0)}
        />
        <SummaryCard
          detail={dictionary.admin.metrics.visibleOnWiki}
          title={dictionary.admin.metrics.published}
          value={taxonomy.sections.reduce((count, item) => count + item.publishedArticles, 0)}
        />
        <SummaryCard
          detail={formatTemplate(dictionary.admin.metrics.sectionsInUse, {
            count: formatNumber(lang, taxonomy.sections.length),
          })}
          title={dictionary.admin.metrics.tags}
          value={taxonomy.tags.length}
        />
      </section>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-5 text-primary" />
            {dictionary.admin.filterArticles}
          </CardTitle>
          <CardDescription>{dictionary.admin.filterArticlesDescription}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto]">
            <label className="field-block">
              <span>{dictionary.common.search}</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="field-input pl-10"
                  defaultValue={query}
                  name="q"
                  placeholder={dictionary.admin.searchPlaceholder}
                />
              </div>
            </label>
            <label className="field-block">
              <span>{dictionary.common.status}</span>
              <select className="field-input" defaultValue={status ?? ""} name="status">
                {statusOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>{dictionary.common.tag}</span>
              <select className="field-input" defaultValue={tag} name="tag">
                <option value="">{dictionary.common.allTags}</option>
                {taxonomy.tags.slice(0, 100).map((item) => (
                  <option key={item.tag} value={item.tag}>
                    {item.tag}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-block">
              <span>{dictionary.common.section}</span>
              <select className="field-input" defaultValue={section} name="section">
                <option value="">{dictionary.common.allSections}</option>
                {taxonomy.sections.map((item) => (
                  <option key={item.slug || "root"} value={item.slug}>
                    {item.slug ? item.label : dictionary.common.root}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-3">
              <Button type="submit">{dictionary.common.apply}</Button>
              {activeFilterCount > 0 ? (
                <Button variant="outline" asChild>
                  <Link href={localizeHref(lang, "/admin/articles")}>{dictionary.common.reset}</Link>
                </Button>
              ) : null}
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            {status ? (
              <ActiveFilter href={buildArticleHref(lang, { q: query, tag, section })}>
                {dictionary.common.status.toLowerCase()}: {getStatusLabel(status, dictionary)}
              </ActiveFilter>
            ) : null}
            {tag ? (
              <ActiveFilter href={buildArticleHref(lang, { q: query, status, section })}>
                {dictionary.common.tag.toLowerCase()}: {tag}
              </ActiveFilter>
            ) : null}
            {section ? (
              <ActiveFilter href={buildArticleHref(lang, { q: query, status, tag })}>
                {dictionary.common.section.toLowerCase()}: {section}
              </ActiveFilter>
            ) : null}
            {query ? (
              <ActiveFilter href={buildArticleHref(lang, { status, tag, section })}>
                {dictionary.common.search.toLowerCase()}: {query}
              </ActiveFilter>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[2rem] border-border/50 bg-background/80 shadow-sm">
        <CardHeader>
          <CardTitle>{dictionary.admin.articleLibrary}</CardTitle>
          <CardDescription>
            {totalCount === 0
              ? dictionary.admin.noArticlesMatchFilters
              : formatTemplate(dictionary.admin.showingPage, {
                  current: formatNumber(lang, currentPage),
                  total: formatNumber(lang, Math.max(totalPages, 1)),
                })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {articles.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {dictionary.admin.noArticlesFound}
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
                          href={localizeHref(lang, `/admin/articles/${article.id}`)}
                          className="text-lg font-medium hover:text-primary"
                        >
                          {article.title}
                        </Link>
                        <Badge
                          variant={article.status === ArticleStatus.PUBLISHED ? "default" : "secondary"}
                        >
                          {getStatusLabel(article.status, dictionary)}
                        </Badge>
                        <Badge variant="outline">
                          {formatTemplate(dictionary.admin.commentsCount, {
                            count: formatNumber(lang, article._count.comments),
                          })}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">/{article.path}</p>
                      {article.description ? (
                        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                          {article.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {article.tags.map((item) => (
                          <Link
                            key={item}
                            href={buildArticleHref(lang, { q: query, status, section, tag: item })}
                          >
                            <Badge variant={item === tag ? "default" : "secondary"}>
                              {item}
                            </Badge>
                          </Link>
                        ))}
                        {article.tags.length === 0 ? (
                          <Badge variant="outline">{dictionary.admin.untagged}</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatTemplate(dictionary.admin.authorLine, {
                          author: article.author.name,
                          date: formatDateTime(lang, article.updatedAt),
                          editor: article.editor ? ` · ${article.editor}` : "",
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 xl:max-w-[320px] xl:justify-end">
                      <Button variant="outline" asChild>
                        <Link href={localizeHref(lang, `/admin/articles/${article.id}`)}>
                          {dictionary.common.editArticle}
                        </Link>
                      </Button>
                      {article.status === ArticleStatus.PUBLISHED ? (
                        <Button variant="outline" asChild>
                          <Link href={buildWikiHref(article.path, lang)} target="_blank">
                            <ExternalLink data-icon="inline-start" />
                            {dictionary.common.viewLive}
                          </Link>
                        </Button>
                      ) : null}
                      <form action={setArticleStatusAction.bind(null, lang, article.id, targetStatus)}>
                        <Button type="submit">
                          {article.status === ArticleStatus.PUBLISHED
                            ? dictionary.admin.moveToDraft
                            : dictionary.admin.publishNow}
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
                        ? buildArticleHref(lang, {
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
                        href={buildArticleHref(lang, {
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
                        ? buildArticleHref(lang, {
                            q: query,
                            status,
                            tag,
                            section,
                            page: currentPage + 1,
                          })
                        : "#"
                    }
                    className={currentPage === totalPages ? "pointer-events-none opacity-40" : ""}
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
  detail,
  title,
  value,
}: {
  detail: string;
  title: string;
  value: number;
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

function buildArticleHref(
  locale: Locale,
  {
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
  },
) {
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
  return search
    ? localizeHref(locale, `/admin/articles?${search}`)
    : localizeHref(locale, "/admin/articles");
}

function buildPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, "ellipsis", totalPages] as const;
  }

  if (currentPage >= totalPages - 2) {
    return [1, "ellipsis", totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as const;
  }

  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages] as const;
}

function getStatusLabel(
  status: ArticleStatus,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  return status === ArticleStatus.PUBLISHED
    ? dictionary.common.published
    : dictionary.common.draft;
}
