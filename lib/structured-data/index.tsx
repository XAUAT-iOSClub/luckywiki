import { getIntlLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { buildWikiHref, splitPath } from "@/lib/wiki/path";
import { getSiteSettings, getSiteUrl } from "@/lib/site";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { extractMarkdownDescription } from "@/lib/text";

function jsonLd<T>(data: T) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data, null, 2) }}
    />
  );
}

export async function WebSiteJsonLd({ locale }: { locale: Locale }) {
  const siteUrl = getSiteUrl();
  const [dictionary, siteSettings] = await Promise.all([
    getDictionary(locale),
    getSiteSettings(),
  ]);

  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteSettings.siteName,
    description: siteSettings.description || dictionary.metadata.description,
    url: siteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteUrl}${localizeHref(locale, "/wiki")}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return jsonLd(data);
}

export async function ArticleJsonLd({
  article,
  locale,
}: {
  article: {
    title: string;
    markdown: string;
    path: string;
    publishedAt?: Date | null;
    updatedAt?: Date;
    authorName?: string;
    tags?: string[];
  };
  locale: Locale;
}) {
  const siteUrl = getSiteUrl();
  const [dictionary, siteSettings] = await Promise.all([
    getDictionary(locale),
    getSiteSettings(),
  ]);
  const articleUrl = `${siteUrl}${buildWikiHref(article.path, locale)}`;

  const description = article.markdown
    ? extractMarkdownDescription(article.markdown)
    : "";

  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description,
    url: articleUrl,
    datePublished: article.publishedAt?.toISOString() ?? undefined,
    dateModified: article.updatedAt?.toISOString() ?? undefined,
    author: article.authorName
      ? { "@type": "Person", name: article.authorName }
      : undefined,
    publisher: {
      "@type": "Organization",
      name: siteSettings.siteName,
    },
    keywords: article.tags?.length ? article.tags.join(", ") : undefined,
  };

  return jsonLd(data);
}

export async function BreadcrumbListJsonLd({
  path,
  locale,
}: {
  path: string;
  locale: Locale;
}) {
  const siteUrl = getSiteUrl();
  const [dictionary, siteSettings] = await Promise.all([
    getDictionary(locale),
    getSiteSettings(),
  ]);
  const segments = splitPath(path);

  const itemListElement = [
    {
      "@type": "ListItem" as const,
      position: 1,
      name: siteSettings.siteName,
      item: `${siteUrl}${localizeHref(locale, "/wiki/home")}`,
    },
    ...segments.map((segment, index) => {
      const partialPath = segments.slice(0, index + 1).join("/");
      return {
        "@type": "ListItem" as const,
        position: index + 2,
        name: segment,
        item: `${siteUrl}${buildWikiHref(partialPath, locale)}`,
      };
    }),
  ];

  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  });
}

