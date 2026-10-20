import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, FolderTree } from "lucide-react";
import {
  EmptyState,
  List,
  Page,
  PageHeader,
  Panel,
} from "@/components/ui/page-ui";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatNumber } from "@/lib/i18n/format";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { listPublishedTaxonomy } from "@/lib/articles";
import { buildPageMetadata } from "@/lib/metadata";
import { buildWikiCategoryHref } from "@/lib/wiki/path";

type Params = Promise<{ lang: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const dictionary = await getDictionary(lang);
  return buildPageMetadata(
    {
      title: dictionary.wiki.categoryIndexTitle,
      description: dictionary.wiki.taxonomyIndexDescription,
      path: localizeHref(lang, "/wiki/category"),
    },
    lang,
  );
}

export default async function WikiCategoryIndexPage({ params }: { params: Params }) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const [taxonomy, dictionary] = await Promise.all([
    listPublishedTaxonomy(),
    getDictionary(lang),
  ]);

  return (
    <Page className="max-w-4xl">
      <PageHeader
        actions={
          <p className="text-[12px] tabular-nums text-muted-foreground">
            {formatNumber(lang, taxonomy.sections.length)}{" "}
            {dictionary.common.sections.toLowerCase()}
          </p>
        }
        descriptionClassName="text-[13.5px] leading-6"
        description={dictionary.wiki.taxonomyIndexDescription}
        title={dictionary.wiki.categoryIndexTitle}
        titleClassName="text-[28px] sm:text-[30px]"
      />

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <FolderTree className="size-4 text-muted-foreground" />
            {dictionary.common.sections}
          </span>
        }
      >
        {taxonomy.sections.length > 0 ? (
          <List>
            {taxonomy.sections.map((item) => (
              <Link
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
                href={buildWikiCategoryHref(item.slug, lang)}
                key={item.slug}
              >
                <p className="min-w-0 truncate font-mono text-[13px] text-foreground">
                  /{item.slug}
                </p>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {formatNumber(lang, item.articleCount)}{" "}
                    {dictionary.common.articles}
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground/60" />
                </div>
              </Link>
            ))}
          </List>
        ) : (
          <EmptyState
            description={dictionary.notFound.description}
            icon={FolderTree}
            title={dictionary.wiki.categoryIndexTitle}
          />
        )}
      </Panel>
    </Page>
  );
}
