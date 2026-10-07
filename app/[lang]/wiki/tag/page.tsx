import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
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
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 lg:px-12">
      <header className="mb-8 space-y-3">
        <p className="eyebrow">{dictionary.wiki.tagBreadcrumb}</p>
        <h1 className="text-4xl font-bold tracking-tight">{dictionary.wiki.tagIndexTitle}</h1>
        <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
          {dictionary.wiki.taxonomyIndexDescription}
        </p>
      </header>

      {taxonomy.tags.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {taxonomy.tags.map((item) => (
            <Badge key={item.tag} asChild variant="secondary" className="h-8 px-3 text-sm">
              <Link href={buildWikiTagHref(item.tag, lang)}>
                {item.tag} · {formatNumber(lang, item.articleCount)}
              </Link>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{dictionary.admin.noTagsYet}</p>
      )}
    </div>
  );
}
