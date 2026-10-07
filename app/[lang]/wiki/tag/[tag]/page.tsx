import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiArticleResults } from "@/components/wiki-article-results";
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
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 lg:px-12">
      <header className="mb-8 space-y-3">
        <p className="eyebrow">{dictionary.wiki.tagBreadcrumb}</p>
        <h1 className="text-4xl font-bold tracking-tight">
          {formatTemplate(dictionary.wiki.tagPageTitle, { tag })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatTemplate(dictionary.wiki.articleCount, { count: formatNumber(lang, articles.length) })}
        </p>
      </header>
      <WikiArticleResults articles={articles} locale={lang} />
    </div>
  );
}
