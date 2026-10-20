import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WikiArticleResults } from "@/components/wiki-article-results";
import { Page, PageHeader } from "@/components/ui/page-ui";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatNumber, formatTemplate } from "@/lib/i18n/format";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { listPublishedArticlesByTag } from "@/lib/articles";
import { decodeTaxonomyParam } from "@/lib/wiki/taxonomy";

type Params = Promise<{ lang: string; tag: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, tag: rawTag } = await params;
  if (!hasLocale(lang)) notFound();

  const tag = decodeTaxonomyParam(rawTag);
  if (!tag) notFound();

  const dictionary = await getDictionary(lang);
  return buildPageMetadata(
    {
      title: formatTemplate(dictionary.wiki.tagPageTitle, { tag }),
      description: dictionary.wiki.taxonomyIndexDescription,
      path: localizeHref(lang, `/wiki/tag/${encodeURIComponent(tag)}`),
    },
    lang,
  );
}

export default async function WikiTagPage({ params }: { params: Params }) {
  const { lang, tag: rawTag } = await params;
  if (!hasLocale(lang)) notFound();

  const tag = decodeTaxonomyParam(rawTag);
  if (!tag) notFound();

  const [articles, dictionary] = await Promise.all([
    listPublishedArticlesByTag(tag),
    getDictionary(lang),
  ]);

  if (articles.length === 0) notFound();

  return (
    <Page className="max-w-4xl">
      <PageHeader
        actions={
          <Link
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-card px-2.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            href={localizeHref(lang, "/wiki/tag")}
          >
            <ArrowLeft className="size-3.5" />
            {dictionary.wiki.tagBreadcrumb}
          </Link>
        }
        descriptionClassName="text-[13.5px] leading-6"
        description={formatTemplate(dictionary.wiki.articleCount, {
          count: formatNumber(lang, articles.length),
        })}
        titleClassName="text-[28px] sm:text-[30px]"
        title={formatTemplate(dictionary.wiki.tagPageTitle, { tag })}
      />
      <WikiArticleResults articles={articles} locale={lang} />
    </Page>
  );
}
