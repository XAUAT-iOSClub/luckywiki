import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDiff, History } from "lucide-react";
import { restoreArticleRevisionAction } from "@/app/actions/admin";
import { RestoreRevisionForm } from "@/components/admin/restore-revision-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { getArticleById } from "@/lib/articles";
import {
  ARTICLE_REVISIONS_PAGE_SIZE,
  listArticleRevisions,
} from "@/lib/articles/revisions";
import { formatDateTime, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref } from "@/lib/i18n/config";

type Params = Promise<{ lang: string; id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ArticleHistoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang, id } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const [article, dictionary, rawSearchParams] = await Promise.all([
    getArticleById(id),
    getDictionary(lang),
    searchParams,
  ]);

  if (!article) {
    notFound();
  }

  const requestedPage = Math.max(
    Number(getSingleParam(rawSearchParams, "page")) || 1,
    1,
  );
  const { revisions, totalCount, page, pageSize, totalPages } =
    await listArticleRevisions(id, {
      page: requestedPage,
      pageSize: ARTICLE_REVISIONS_PAGE_SIZE,
    });
  const editorHref = localizeHref(lang, `/admin/articles/${article.id}`);
  const labels = dictionary.admin.revisionHistory;

  return (
    <Page>
      <PageHeader
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href={editorHref}>
              <ArrowLeft data-icon="inline-start" />
              {labels.backToArticle}
            </Link>
          </Button>
        }
        description={
          <span className="block space-y-1">
            <span className="block">{labels.description}</span>
            <span className="block font-mono text-[11.5px] text-muted-foreground/80">
              /{article.path}
            </span>
          </span>
        }
        title={article.title}
      />

      <Panel
        description={
          totalCount === 0
            ? labels.noRevisions
            : `${formatTemplate(labels.totalVersions, {
                count: String(totalCount),
              })} · ${pageLabel(page, totalPages)}`
        }
        title={
          <span className="inline-flex items-center gap-2">
            <History className="size-4 text-muted-foreground" />
            {labels.history}
          </span>
        }
      >
        {revisions.length === 0 ? (
          <EmptyState
            description={labels.noRevisions}
            icon={History}
            title={labels.noRevisions}
          />
        ) : (
          <List>
            {revisions.map((revision, index) => {
              const version = totalCount - ((page - 1) * pageSize + index);
              const isLatest = version === totalCount;
              const diffHref = localizeHref(
                lang,
                `/admin/articles/${article.id}/history/${revision.id}`,
              );

              return (
                <ListRow key={revision.id}>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 md:grid-cols-[84px_minmax(0,1fr)_160px_auto] md:items-center">
                    <div className="flex items-center gap-2 md:block">
                      <Badge className="font-mono" variant="outline">
                        {formatTemplate(labels.version, {
                          version: String(version),
                        })}
                      </Badge>
                      {isLatest ? (
                        <StatusDot className="md:mt-1.5" tone="info">
                          {labels.latest}
                        </StatusDot>
                      ) : null}
                    </div>

                    <div className="col-span-2 min-w-0 md:col-span-1">
                      <Link
                        className="truncate text-[13.5px] font-medium text-foreground transition-colors hover:text-primary"
                        href={diffHref}
                      >
                        {revision.title || article.title}
                      </Link>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground md:hidden">
                        {revision.author.name || revision.author.email}
                        <span className="px-1.5 text-border">·</span>
                        {formatDateTime(lang, revision.createdAt)}
                      </p>
                    </div>

                    <div className="hidden min-w-0 md:block">
                      <p className="truncate text-[12px] text-foreground/80">
                        {revision.author.name || revision.author.email}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {formatDateTime(lang, revision.createdAt)}
                      </p>
                    </div>

                    <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={diffHref}>
                          <FileDiff data-icon="inline-start" />
                          {labels.viewDiff}
                        </Link>
                      </Button>
                      {!isLatest ? (
                        <RestoreRevisionForm
                          action={restoreArticleRevisionAction.bind(
                            null,
                            article.id,
                            lang,
                          )}
                          label={labels.restore}
                          revisionId={revision.id}
                        />
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
            <p className="text-[12px] text-muted-foreground">
              {pageLabel(page, totalPages)}
            </p>
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    className={page === 1 ? "pointer-events-none opacity-40" : ""}
                    href={
                      page > 1
                        ? buildHistoryHref(lang, article.id, page - 1)
                        : "#"
                    }
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    className={
                      page === totalPages ? "pointer-events-none opacity-40" : ""
                    }
                    href={
                      page < totalPages
                        ? buildHistoryHref(lang, article.id, page + 1)
                        : "#"
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

function pageLabel(page: number, totalPages: number) {
  return `${page} / ${Math.max(totalPages, 1)}`;
}

function getSingleParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function buildHistoryHref(locale: "zh" | "en", articleId: string, page: number) {
  const search = page > 1 ? `?page=${page}` : "";
  return localizeHref(locale, `/admin/articles/${articleId}/history${search}`);
}
