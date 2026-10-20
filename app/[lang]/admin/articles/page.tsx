import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ExternalLink,
  FileText,
  History,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { ArticleStatus } from "@/generated/prisma/enums";
import { setArticleStatusAction } from "@/app/actions/admin";
import { listAdminTaxonomy } from "@/lib/admin";
import { listAdminArticles } from "@/lib/articles";
import { buildWikiHref } from "@/lib/wiki/path";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  EmptyState,
  List,
  ListRow,
  Page,
  PageHeader,
  Panel,
  StatusDot,
} from "@/components/ui/page-ui";
import { formatDateTime, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref, type Locale } from "@/lib/i18n/config";

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
  const pageLabel = formatTemplate(dictionary.admin.showingPage, {
    current: formatNumber(lang, currentPage),
    total: formatNumber(lang, Math.max(totalPages, 1)),
  });

  return (
    <Page>
      <PageHeader
        actions={
          <Button asChild size="sm">
            <Link href={localizeHref(lang, "/admin/articles/new")}>
              <Plus data-icon="inline-start" />
              {dictionary.admin.createArticle}
            </Link>
          </Button>
        }
        description={dictionary.admin.filterArticlesDescription}
        title={dictionary.common.articles}
      />

      <Panel
        description={
          totalCount === 0
            ? dictionary.admin.noArticlesMatchFilters
            : `${formatTemplate(dictionary.admin.articlesCount, {
                count: formatNumber(lang, totalCount),
              })} · ${pageLabel}`
        }
        title={dictionary.admin.articleLibrary}
      >
        <form className="flex flex-col gap-2 border-b border-border/60 px-5 py-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1 lg:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={dictionary.common.search}
              className="h-8 pl-8"
              defaultValue={query}
              name="q"
              placeholder={dictionary.admin.searchPlaceholder}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={dictionary.common.status}
              className="select-native w-auto"
              defaultValue={status ?? ""}
              name="status"
            >
              {statusOptions.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label={dictionary.common.tag}
              className="select-native w-auto"
              defaultValue={tag}
              name="tag"
            >
              <option value="">{dictionary.common.allTags}</option>
              {taxonomy.tags.slice(0, 100).map((item) => (
                <option key={item.tag} value={item.tag}>
                  {item.tag}
                </option>
              ))}
            </select>
            <select
              aria-label={dictionary.common.section}
              className="select-native w-auto"
              defaultValue={section}
              name="section"
            >
              <option value="">{dictionary.common.allSections}</option>
              {taxonomy.sections.map((item) => (
                <option key={item.slug || "root"} value={item.slug}>
                  {item.slug ? item.label : dictionary.common.root}
                </option>
              ))}
            </select>
            <Button size="sm" type="submit">
              {dictionary.common.apply}
            </Button>
            {activeFilterCount > 0 ? (
              <Button asChild size="sm" variant="ghost">
                <Link href={localizeHref(lang, "/admin/articles")}>
                  {dictionary.common.reset}
                </Link>
              </Button>
            ) : null}
          </div>
        </form>

        {activeFilterCount > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 bg-muted/20 px-5 py-2.5">
            {status ? (
              <ActiveFilter
                href={buildArticleHref(lang, { q: query, tag, section })}
                label={`${dictionary.common.status}: ${getStatusLabel(status, dictionary)}`}
              />
            ) : null}
            {tag ? (
              <ActiveFilter
                href={buildArticleHref(lang, { q: query, status, section })}
                label={`${dictionary.common.tag}: ${tag}`}
              />
            ) : null}
            {section ? (
              <ActiveFilter
                href={buildArticleHref(lang, { q: query, status, tag })}
                label={`${dictionary.common.section}: ${section}`}
              />
            ) : null}
            {query ? (
              <ActiveFilter
                href={buildArticleHref(lang, { status, tag, section })}
                label={`${dictionary.common.search}: ${query}`}
              />
            ) : null}
          </div>
        ) : null}

        {articles.length === 0 ? (
          <EmptyState
            action={
              activeFilterCount > 0 ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={localizeHref(lang, "/admin/articles")}>
                    {dictionary.common.reset}
                  </Link>
                </Button>
              ) : null
            }
            description={dictionary.admin.noArticlesFound}
            icon={FileText}
            title={dictionary.admin.noArticlesMatchFilters}
          />
        ) : (
          <List>
            {articles.map((article) => {
              const targetStatus =
                article.status === ArticleStatus.PUBLISHED
                  ? ArticleStatus.DRAFT
                  : ArticleStatus.PUBLISHED;

              return (
                <ListRow key={article.id}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_96px_auto]">
                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <Link
                        className="block truncate text-[13.5px] font-medium text-foreground transition-colors hover:text-primary"
                        href={localizeHref(lang, `/admin/articles/${article.id}`)}
                      >
                        {article.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
                        <span className="truncate font-mono">/{article.path}</span>
                        {article.tags.slice(0, 3).map((item) => (
                          <Link
                            key={item}
                            className="transition-colors hover:text-foreground"
                            href={buildArticleHref(lang, {
                              q: query,
                              status,
                              section,
                              tag: item,
                            })}
                          >
                            #{item}
                          </Link>
                        ))}
                        {article.tags.length === 0 ? (
                          <span>{dictionary.admin.untagged}</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                        {article.author.name}
                        <span className="px-1.5 text-border">·</span>
                        {formatDateTime(lang, article.updatedAt)}
                      </p>
                    </div>

                    <StatusDot
                      tone={
                        article.status === ArticleStatus.PUBLISHED
                          ? "success"
                          : "muted"
                      }
                    >
                      {getStatusLabel(article.status, dictionary)}
                    </StatusDot>

                    <div className="flex items-center justify-end gap-0.5">
                      <form
                        action={setArticleStatusAction.bind(
                          null,
                          lang,
                          article.id,
                          targetStatus,
                        )}
                      >
                        <Button
                          className="text-[11.5px] text-muted-foreground hover:text-foreground"
                          size="sm"
                          type="submit"
                          variant="ghost"
                        >
                          {article.status === ArticleStatus.PUBLISHED
                            ? dictionary.admin.moveToDraft
                            : dictionary.admin.publishNow}
                        </Button>
                      </form>
                      <Button asChild size="icon-xs" variant="ghost">
                        <Link
                          aria-label={dictionary.admin.revisionHistory.history}
                          href={localizeHref(
                            lang,
                            `/admin/articles/${article.id}/history`,
                          )}
                          title={dictionary.admin.revisionHistory.history}
                        >
                          <History />
                        </Link>
                      </Button>
                      {article.status === ArticleStatus.PUBLISHED ? (
                        <Button asChild size="icon-xs" variant="ghost">
                          <Link
                            aria-label={dictionary.common.viewLive}
                            href={buildWikiHref(article.path, lang)}
                            target="_blank"
                            title={dictionary.common.viewLive}
                          >
                            <ExternalLink />
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </ListRow>
              );
            })}
          </List>
        )}

        {totalPages > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3">
            <p className="text-[12px] text-muted-foreground">{pageLabel}</p>
            <Pagination className="mx-0 w-auto justify-end">
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
                    className={
                      currentPage === 1 ? "pointer-events-none opacity-40" : ""
                    }
                  />
                </PaginationItem>
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
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-40"
                        : ""
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        ) : null}
      </Panel>
    </Page>
  );
}

function ActiveFilter({ href, label }: { href: string; label: ReactNode }) {
  return (
    <Badge asChild variant="secondary">
      <Link className="gap-1.5" href={href}>
        {label}
        <X className="size-3 opacity-60" />
      </Link>
    </Badge>
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

  if (q) nextSearchParams.set("q", q);
  if (status) nextSearchParams.set("status", status);
  if (tag) nextSearchParams.set("tag", tag);
  if (section) nextSearchParams.set("section", section);
  if (page && page > 1) nextSearchParams.set("page", String(page));

  const search = nextSearchParams.toString();
  return search
    ? localizeHref(locale, `/admin/articles?${search}`)
    : localizeHref(locale, "/admin/articles");
}

function getStatusLabel(
  status: ArticleStatus,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  return status === ArticleStatus.PUBLISHED
    ? dictionary.common.published
    : dictionary.common.draft;
}
