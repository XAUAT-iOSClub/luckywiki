/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Images, Search } from "lucide-react";
import { MediaActions } from "@/components/admin/media-actions";
import { MediaCleanupButton } from "@/components/admin/media-cleanup-button";
import { MediaUploadButton } from "@/components/admin/media-upload-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { isRootUser } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { formatDateTime, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { hasLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { formatFileSize } from "@/lib/media/format";
import {
  getMediaStats,
  listMediaAssets,
  type MediaSort,
  type MediaUsageFilter,
} from "@/lib/media/library";
import { getMediaOrphanGraceDays } from "@/lib/media/policy";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ lang: string }>;

const pageSize = 24;
const usageFilters = new Set<MediaUsageFilter>(["all", "used", "unused"]);
const sortOptions = new Set<MediaSort>(["newest", "oldest", "largest", "mostUsed"]);

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Media Library",
    robots: { index: false, follow: false },
  };
}

export default async function AdminMediaPage({
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
  const search = await searchParams;
  const query = getSingleParam(search, "q")?.trim() ?? "";
  const usageValue = getSingleParam(search, "usage");
  const sortValue = getSingleParam(search, "sort");
  const usage = usageFilters.has(usageValue as MediaUsageFilter)
    ? (usageValue as MediaUsageFilter)
    : "all";
  const sort = sortOptions.has(sortValue as MediaSort)
    ? (sortValue as MediaSort)
    : "newest";
  const currentPage = Math.max(Number(getSingleParam(search, "page")) || 1, 1);
  const [session, result, stats] = await Promise.all([
    getCurrentSession(),
    listMediaAssets({
      page: currentPage,
      pageSize,
      query,
      sort,
      usage,
    }),
    getMediaStats(),
  ]);
  const isRoot = isRootUser(session?.user ?? null);
  const graceDays = getMediaOrphanGraceDays();
  const activeFilterCount = [query, usage !== "all", sort !== "newest"].filter(
    Boolean,
  ).length;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 md:pt-6">
      <section className="surface-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <p className="eyebrow">{dictionary.admin.media.eyebrow}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">
                {dictionary.admin.media.title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {dictionary.admin.media.description}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {isRoot ? <MediaCleanupButton graceDays={graceDays} /> : null}
            <MediaUploadButton />
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MediaStatCard
          detail={formatTemplate(dictionary.admin.media.totalAssetsDetail, {
            size: formatFileSize(stats.totalBytes),
          })}
          title={dictionary.admin.media.totalAssets}
          value={stats.totalCount}
        />
        <MediaStatCard
          detail={formatTemplate(dictionary.admin.media.usedAssetsDetail, {
            count: formatNumber(lang, stats.usedCount),
          })}
          title={dictionary.admin.media.usedAssets}
          value={stats.usedCount}
        />
        <MediaStatCard
          detail={formatTemplate(dictionary.admin.media.unusedAssetsDetail, {
            size: formatFileSize(stats.unusedBytes),
          })}
          title={dictionary.admin.media.unusedAssets}
          value={stats.unusedCount}
        />
        <Card className="admin-card">
          <CardHeader>
            <CardDescription>{dictionary.admin.media.storage}</CardDescription>
            <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatFileSize(stats.totalBytes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              {dictionary.admin.media.storageDetail}
            </p>
          </CardContent>
        </Card>
      </section>

      <Card className="admin-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Images className="size-5 text-primary" />
            {dictionary.admin.media.title}
          </CardTitle>
          <CardDescription>
            {result.totalCount === 0
              ? dictionary.admin.media.empty
              : formatTemplate(dictionary.admin.media.showingPage, {
                  current: formatNumber(lang, result.page),
                  total: formatNumber(lang, Math.max(result.totalPages, 1)),
                })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto]">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{dictionary.common.search}</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  defaultValue={query}
                  name="q"
                  placeholder={dictionary.admin.media.searchPlaceholder}
                />
              </div>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{dictionary.admin.media.usage}</span>
              <select className="select-native" defaultValue={usage} name="usage">
                <option value="all">{dictionary.admin.media.usageAll}</option>
                <option value="used">{dictionary.admin.media.usageUsed}</option>
                <option value="unused">{dictionary.admin.media.usageUnused}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>{dictionary.admin.media.sort}</span>
              <select className="select-native" defaultValue={sort} name="sort">
                <option value="newest">{dictionary.admin.media.sortNewest}</option>
                <option value="oldest">{dictionary.admin.media.sortOldest}</option>
                <option value="largest">{dictionary.admin.media.sortLargest}</option>
                <option value="mostUsed">{dictionary.admin.media.sortMostUsed}</option>
              </select>
            </label>
            <div className="flex items-end gap-3">
              <Button type="submit">{dictionary.common.apply}</Button>
              {activeFilterCount > 0 ? (
                <Button asChild variant="outline">
                  <Link href={localizeHref(lang, "/admin/media")}>
                    {dictionary.common.reset}
                  </Link>
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="admin-card">
        <CardContent className="p-4 md:p-6">
          {result.assets.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
              <Images className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {dictionary.admin.media.empty}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {result.assets.map((asset) => {
                const canForce = isRoot;
                const canDelete =
                  isRoot ||
                  (asset.uploadedById === session?.user.id &&
                    asset.referenceCount === 0);

                return (
                  <article
                    className="flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60"
                    key={asset.id}
                  >
                    <a
                      className="block aspect-[4/3] overflow-hidden bg-muted"
                      href={asset.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <img
                        alt={asset.altText ?? asset.fileName}
                        className="size-full object-cover transition-transform duration-300 hover:scale-[1.03]"
                        loading="lazy"
                        src={asset.url}
                      />
                    </a>
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h2
                          className="min-w-0 truncate text-sm font-semibold"
                          title={asset.fileName}
                        >
                          {asset.fileName}
                        </h2>
                        <Badge
                          variant={asset.referenceCount > 0 ? "default" : "outline"}
                        >
                          {asset.referenceCount > 0
                            ? formatTemplate(dictionary.admin.media.usedByCount, {
                                count: asset.referenceCount,
                              })
                            : dictionary.admin.media.unused}
                        </Badge>
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(asset.size)} ·{" "}
                        {asset.width && asset.height
                          ? formatTemplate(dictionary.admin.media.dimensions, {
                              height: asset.height,
                              width: asset.width,
                            })
                          : dictionary.admin.media.unknownDimensions}
                      </p>

                      <div className="space-y-0.5 text-[11px] leading-5 text-muted-foreground">
                        <p>
                          {formatTemplate(dictionary.admin.media.uploadedAt, {
                            date: formatDateTime(lang, asset.createdAt),
                          })}
                        </p>
                        <p>
                          {asset.uploadedBy
                            ? formatTemplate(dictionary.admin.media.uploadedBy, {
                                name: asset.uploadedBy.name,
                              })
                            : dictionary.admin.media.importedBySystem}
                        </p>
                      </div>

                      {asset.references.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {asset.references.map((reference) => (
                            <Link
                              className="max-w-full"
                              href={localizeHref(
                                lang,
                                `/admin/articles/${reference.articleId}`,
                              )}
                              key={reference.articleId}
                            >
                              <Badge
                                className="max-w-[12rem] truncate"
                                variant="secondary"
                              >
                                {reference.title}
                              </Badge>
                            </Link>
                          ))}
                          {asset.referenceCount > asset.references.length ? (
                            <Badge variant="outline">
                              +{asset.referenceCount - asset.references.length}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-auto pt-1">
                        <MediaActions
                          altText={asset.altText}
                          assetId={asset.id}
                          canDelete={canDelete}
                          canForce={canForce}
                          fileName={asset.fileName}
                          referenceCount={asset.referenceCount}
                          url={asset.url}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {result.totalPages > 1 ? (
            <div className="mt-4 border-t pt-4">
              <Pagination className="justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      className={
                        result.page === 1
                          ? "pointer-events-none opacity-40"
                          : undefined
                      }
                      href={
                        result.page > 1
                          ? buildMediaHref(lang, {
                              page: result.page - 1,
                              q: query,
                              sort,
                              usage,
                            })
                          : "#"
                      }
                    />
                  </PaginationItem>
                  {buildPageNumbers(result.page, result.totalPages).map(
                    (pageNumber, index) =>
                      pageNumber === "ellipsis" ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={pageNumber}>
                          <PaginationLink
                            href={buildMediaHref(lang, {
                              page: pageNumber,
                              q: query,
                              sort,
                              usage,
                            })}
                            isActive={pageNumber === result.page}
                          >
                            {pageNumber}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                  )}
                  <PaginationItem>
                    <PaginationNext
                      className={
                        result.page === result.totalPages
                          ? "pointer-events-none opacity-40"
                          : undefined
                      }
                      href={
                        result.page < result.totalPages
                          ? buildMediaHref(lang, {
                              page: result.page + 1,
                              q: query,
                              sort,
                              usage,
                            })
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

function buildMediaHref(
  locale: Locale,
  {
    page,
    q,
    sort,
    usage,
  }: {
    page?: number;
    q?: string;
    sort?: MediaSort;
    usage?: MediaUsageFilter;
  },
) {
  const params = new URLSearchParams();

  if (q) {
    params.set("q", q);
  }
  if (usage && usage !== "all") {
    params.set("usage", usage);
  }
  if (sort && sort !== "newest") {
    params.set("sort", sort);
  }
  if (page && page > 1) {
    params.set("page", String(page));
  }

  const search = params.toString();

  return search
    ? localizeHref(locale, `/admin/media?${search}`)
    : localizeHref(locale, "/admin/media");
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

function MediaStatCard({
  detail,
  title,
  value,
}: {
  detail: string;
  title: string;
  value: number;
}) {
  return (
    <Card className="admin-card">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
