import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Locale } from "@/lib/i18n/config";
import { formatDate } from "@/lib/i18n/format";
import type { PublishedArticleListItem } from "@/lib/articles";
import { buildWikiHref, buildWikiTagHref } from "@/lib/wiki/path";

export function WikiArticleResults({
  articles,
  locale,
}: {
  articles: PublishedArticleListItem[];
  locale: Locale;
}) {
  return (
    <div className="grid gap-4">
      {articles.map((article) => (
        <article
          key={article.path}
          className="surface-panel border-border/50 p-5 transition-colors hover:border-primary/40"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <h2 className="text-xl font-semibold tracking-tight">
                <Link
                  href={buildWikiHref(article.path, locale)}
                  className="hover:text-primary hover:underline underline-offset-4"
                >
                  {article.title}
                </Link>
              </h2>
              {article.description ? (
                <p className="text-sm leading-6 text-muted-foreground">
                  {article.description}
                </p>
              ) : null}
              <p className="font-mono text-xs text-muted-foreground/80">/{article.path}</p>
            </div>
            <time
              dateTime={article.updatedAt.toISOString()}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {formatDate(locale, article.updatedAt, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </time>
          </div>

          {article.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <Badge key={tag} asChild variant="secondary">
                  <Link href={buildWikiTagHref(tag, locale)}>{tag}</Link>
                </Badge>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
