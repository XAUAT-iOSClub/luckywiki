import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WikiArticleResults } from "@/components/wiki-article-results";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatNumber, formatTemplate } from "@/lib/i18n/format";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { buildPageMetadata } from "@/lib/metadata";
import { listPublishedArticlesBySection } from "@/lib/articles";
import { decodeCategoryParam } from "@/lib/wiki/taxonomy";

type Params = Promise<{ lang: string; category: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { lang, category: rawCategory } = await params;
  if (!hasLocale(lang)) notFound();

  const category = decodeCategoryParam(rawCategory);
  if (!category) notFound();

  const dictionary = await getDictionary(lang);
  return buildPageMetadata(
    {
      title: formatTemplate(dictionary.wiki.categoryPageTitle, { category }),
      description: dictionary.wiki.taxonomyIndexDescription,
      path: localizeHref(lang, `/wiki/category/${encodeURIComponent(category)}`),
    },
    lang,
  );
}

export default async function WikiCategoryPage({ params }: { params: Params }) {
  const { lang, category: rawCategory } = await params;
  if (!hasLocale(lang)) notFound();

  const category = decodeCategoryParam(rawCategory);
  if (!category) notFound();

  const [articles, dictionary] = await Promise.all([
    listPublishedArticlesBySection(category),
    getDictionary(lang),
  ]);

  if (articles.length === 0) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 lg:px-12">
      <header className="mb-8 space-y-3">
        <p className="eyebrow">{dictionary.wiki.categoryBreadcrumb}</p>
        <h1 className="text-4xl font-bold tracking-tight">
          {formatTemplate(dictionary.wiki.categoryPageTitle, { category })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatTemplate(dictionary.wiki.articleCount, { count: formatNumber(lang, articles.length) })}
        </p>
      </header>
      <WikiArticleResults articles={articles} locale={lang} />
    </div>
  );
}
