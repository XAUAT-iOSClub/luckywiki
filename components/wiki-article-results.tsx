import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { List, Panel } from "@/components/ui/page-ui";
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
    <Panel>
      <List>
        {articles.map((article) => (
          <div
            className="px-5 py-4 transition-colors hover:bg-muted/35"
            key={article.path}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="min-w-0 space-y-1">
                <h2 className="text-[15px] font-medium leading-6 tracking-[-0.005em]">
                  <Link
                    className="transition-colors hover:text-primary"
                    href={buildWikiHref(article.path, locale)}
                  >
                    {article.title}
                  </Link>
                </h2>
                {article.description ? (
                  <p className="line-clamp-2 text-[13px] leading-6 text-muted-foreground">
                    {article.description}
                  </p>
                ) : null}
                <p className="truncate font-mono text-[11.5px] text-muted-foreground/80">
                  /{article.path}
                </p>
              </div>
              <time
                className="shrink-0 text-[11.5px] text-muted-foreground"
                dateTime={article.updatedAt.toISOString()}
              >
                {formatDate(locale, article.updatedAt, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </time>
            </div>

            {article.tags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {article.tags.map((tag) => (
                  <Badge key={tag} asChild variant="secondary">
                    <Link href={buildWikiTagHref(tag, locale)}>{tag}</Link>
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </List>
    </Panel>
  );
}
