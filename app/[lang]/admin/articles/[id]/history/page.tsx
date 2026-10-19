import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDiff, History } from "lucide-react";
import { restoreArticleRevisionAction } from "@/app/actions/admin";
import { RestoreRevisionForm } from "@/components/admin/restore-revision-form";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    <div className="flex flex-col gap-6 p-4 md:p-8 md:pt-6">
      <section className="surface-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">{labels.eyebrow}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {article.title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {labels.description}
              </p>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {article.path}
            </p>
          </div>
          <Button asChild className="rounded-full px-6" variant="outline">
            <Link href={editorHref}>
              <ArrowLeft />
              {labels.backToArticle}
            </Link>
          </Button>
        </div>
      </section>

      <Card className="admin-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            {labels.history}
          </CardTitle>
          <CardDescription>
            {totalCount === 0
              ? labels.noRevisions
              : `${formatTemplate(labels.totalVersions, {
                  count: String(totalCount),
                })} · ${labels.revisionsDescription}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {revisions.length === 0 ? (
            <div className="border-t border-dashed p-8 text-center text-sm text-muted-foreground">
              {labels.noRevisions}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{labels.versionColumn}</TableHead>
                  <TableHead>{dictionary.common.title}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {dictionary.common.author}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {dictionary.common.time}
                  </TableHead>
                  <TableHead className="pr-6 text-right">
                    {dictionary.common.action}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.map((revision, index) => {
                  const version =
                    totalCount - ((page - 1) * pageSize + index);
                  const isLatest = version === totalCount;
                  const diffHref = localizeHref(
                    lang,
                    `/admin/articles/${article.id}/history/${revision.id}`,
                  );

                  return (
                    <TableRow key={revision.id}>
                      <TableCell className="pl-6 py-4">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className="font-mono text-[10px]"
                            variant="outline"
                          >
                            {formatTemplate(labels.version, {
                              version: String(version),
                            })}
                          </Badge>
                          {isLatest ? (
                            <Badge className="text-[10px]" variant="secondary">
                              {labels.latest}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          className="font-medium text-sm transition-colors hover:text-primary"
                          href={diffHref}
                        >
                          {revision.title || article.title}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-xs font-medium">
                          {revision.author.name || revision.author.email}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {revision.author.email}
                        </p>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">
                        {formatDateTime(lang, revision.createdAt)}
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex flex-col items-end gap-2">
                          <Button asChild size="sm" variant="ghost">
                            <Link href={diffHref}>
                              <FileDiff className="size-3.5" />
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
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {totalPages > 1 ? (
            <div className="border-t p-4">
              <Pagination className="justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      className={
                        page === 1 ? "pointer-events-none opacity-40" : ""
                      }
                      href={
                        page > 1
                          ? buildHistoryHref(lang, article.id, page - 1)
                          : "#"
                      }
                    />
                  </PaginationItem>
                  {buildPageNumbers(page, totalPages).map((pageNumber, index) =>
                    pageNumber === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${index}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          href={buildHistoryHref(lang, article.id, pageNumber)}
                          isActive={pageNumber === page}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      className={
                        page === totalPages
                          ? "pointer-events-none opacity-40"
                          : ""
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
        </CardContent>
      </Card>
    </div>
  );
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
