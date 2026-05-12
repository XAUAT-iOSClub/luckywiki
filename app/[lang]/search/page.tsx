import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { searchArticles } from "@/lib/search";
import { buildWikiHref } from "@/lib/wiki/path";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lang } = await params;
  return { robots: "noindex, follow", alternates: { languages: { [lang]: localizeHref(lang as Locale, "/search") } } };
}

export default async function SearchPage({
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

  const locale: Locale = lang;
  const dictionary = await getDictionary(locale);
  const paramsObject = await searchParams;
  const query = getSingleParam(paramsObject, "q")?.trim() ?? "";
  const page = Math.max(Number(getSingleParam(paramsObject, "page")) || 1, 1);

  const { results, totalCount, totalPages } = await searchArticles({ query, page });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{dictionary.search.title}</h1>
        <p className="text-muted-foreground">{dictionary.search.description}</p>
      </header>

      <form
        action={localizeHref(locale, "/search")}
        method="GET"
        className="relative"
      >
        <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          className="field-input h-14 rounded-[1.75rem] pl-14 pr-28 text-base"
          defaultValue={query}
          name="q"
          placeholder={dictionary.search.inputPlaceholder}
          autoFocus
        />
        <Button
          type="submit"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 rounded-[1.5rem] px-6"
        >
          {dictionary.common.search}
        </Button>
      </form>

      {!query ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-background/50 px-8 py-16 text-center">
          <p className="text-lg text-muted-foreground">{dictionary.search.noQuery}</p>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-border bg-background/50 px-8 py-16 text-center">
          <p className="text-lg font-medium">{dictionary.search.noResults}</p>
          <p className="mt-2 text-muted-foreground">{dictionary.search.noResultsHint}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {formatTemplate(dictionary.search.resultsFor, { query })}
              {" · "}
              {formatTemplate(dictionary.search.resultCount, {
                count: formatNumber(locale, totalCount),
              })}
            </p>
            <p className="text-sm text-muted-foreground">
              {formatTemplate(dictionary.search.showingPage, {
                current: formatNumber(locale, page),
                total: formatNumber(locale, totalPages),
              })}
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {results.map((result) => (
              <SearchResultCard
                key={result.id}
                result={result}
                locale={locale}
                dictionary={dictionary}
              />
            ))}
          </div>

          {totalPages > 1 ? (
            <Pagination className="justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href={buildSearchHref(locale, query, page - 1)}
                    className={page <= 1 ? "pointer-events-none opacity-40" : ""}
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
                        href={buildSearchHref(locale, query, pageNumber)}
                        isActive={pageNumber === page}
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}
                <PaginationItem>
                  <PaginationNext
                    href={buildSearchHref(locale, query, page + 1)}
                    className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </>
      )}
    </div>
  );
}

function SearchResultCard({
  result,
  locale,
  dictionary,
}: {
  result: {
    id: string;
    path: string;
    title: string;
    description: string | null;
    tags: string[];
    excerpt: string | null;
    matchField: string;
    updatedAt: Date;
  };
  locale: Locale;
  dictionary: Awaited<ReturnType<typeof getDictionary>>;
}) {
  return (
    <Link href={buildWikiHref(result.path, locale)} className="group block">
      <article className="rounded-[1.75rem] border border-border/60 bg-background/50 p-6 transition-colors hover:border-primary/30 hover:bg-muted/30">
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5 min-w-0">
              <h2 className="text-lg font-semibold group-hover:text-primary transition-colors truncate">
                {result.title}
              </h2>
              <p className="font-mono text-xs text-muted-foreground truncate">
                /{result.path}
              </p>
            </div>
          </div>

          {result.description && result.matchField === "title" ? (
            <p className="text-sm text-muted-foreground line-clamp-2">{result.description}</p>
          ) : result.excerpt ? (
            <p className="text-sm text-muted-foreground line-clamp-3">{result.excerpt}</p>
          ) : null}

          {result.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {result.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="rounded-xl text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground/70">
            {formatDateTime(locale, result.updatedAt)}
          </p>
        </div>
      </article>
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

function buildSearchHref(locale: Locale, query: string, page: number) {
  const sp = new URLSearchParams();
  if (query) sp.set("q", query);
  if (page > 1) sp.set("page", String(page));
  const search = sp.toString();
  return search
    ? localizeHref(locale, `/search?${search}`)
    : localizeHref(locale, "/search");
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
