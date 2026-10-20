import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Tags } from "lucide-react";
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
import { buildWikiTagHref } from "@/lib/wiki/path";

type Params = Promise<{ lang: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();

  const dictionary = await getDictionary(lang);
  return buildPageMetadata(
    {
      title: dictionary.wiki.tagIndexTitle,
      description: dictionary.wiki.taxonomyIndexDescription,
      path: localizeHref(lang, "/wiki/tag"),
    },
    lang,
  );
}

export default async function WikiTagIndexPage({ params }: { params: Params }) {
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
            {formatNumber(lang, taxonomy.tags.length)}{" "}
            {dictionary.common.tags.toLowerCase()}
          </p>
        }
        descriptionClassName="text-[13.5px] leading-6"
        description={dictionary.wiki.taxonomyIndexDescription}
        title={dictionary.wiki.tagIndexTitle}
        titleClassName="text-[28px] sm:text-[30px]"
      />

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Tags className="size-4 text-muted-foreground" />
            {dictionary.common.tags}
          </span>
        }
      >
        {taxonomy.tags.length > 0 ? (
          <List>
            {taxonomy.tags.map((item) => (
              <Link
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
                href={buildWikiTagHref(item.tag, lang)}
                key={item.tag}
              >
                <p className="min-w-0 truncate text-[13.5px] font-medium text-foreground">
                  #{item.tag}
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
            description={dictionary.admin.noTagsYet}
            icon={Tags}
            title={dictionary.wiki.tagIndexTitle}
          />
        )}
      </Panel>
    </Page>
  );
}
