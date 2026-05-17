import type { Metadata } from "next";
import { getSiteSettings, getSiteUrl } from "@/lib/site";
import { locales, getIntlLocale, localizeHref, type Locale } from "@/lib/i18n/config";
import { buildWikiHref } from "@/lib/wiki/path";
import { extractMarkdownDescription } from "@/lib/text";

type ArticleMetadataInput = {
  title: string;
  markdown: string;
  path: string;
  tags?: string[];
  publishedAt?: Date | null;
  updatedAt?: Date;
  authorName?: string;
};

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
};

export function getOgImageUrl(title: string, lang: string) {
  const encoded = encodeURIComponent(title.slice(0, 120));
  return `/og?title=${encoded}&lang=${lang}`;
}

function buildAlternates(path: string, lang: string) {
  const siteUrl = getSiteUrl();

  const canonical = path.startsWith("http")
    ? path
    : `${siteUrl}${path}`;

  const languages: Record<string, string> = {};

  for (const locale of locales) {
    const localizedPath = path.startsWith("/wiki/")
      ? buildWikiHref(
          path.replace(/^\/wiki\//, "").replace(/^\/[a-z]{2}\/wiki\//, ""),
          locale,
        )
      : localizeHref(locale, path.replace(/^\/[a-z]{2}(\/|$)/, "/"));
    languages[getIntlLocale(locale)] = `${siteUrl}${localizedPath}`;
  }

  return { canonical, languages };
}

export async function buildArticleMetadata(
  article: ArticleMetadataInput,
  lang: string,
): Promise<Metadata> {
  const siteUrl = getSiteUrl();
  const siteSettings = await getSiteSettings();
  const siteName = siteSettings.siteName;
  const description = extractMarkdownDescription(article.markdown);
  const ogImage = getOgImageUrl(article.title, lang);
  const articlePath = buildWikiHref(article.path, lang as Locale);
  const { canonical, languages } = buildAlternates(articlePath, lang);

  return {
    title: article.title,
    description,
    alternates: { canonical, languages },
    keywords: article.tags?.length ? article.tags : undefined,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      url: canonical,
      siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: article.title,
        },
      ],
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt?.toISOString(),
      authors: article.authorName ? [article.authorName] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [ogImage],
    },
  };
}

export async function buildPageMetadata(
  { title, description, path }: PageMetadataInput,
  lang: string,
): Promise<Metadata> {
  const siteSettings = await getSiteSettings();
  const siteName = siteSettings.siteName;
  const ogImage = getOgImageUrl(title, lang);
  const { canonical, languages } = buildAlternates(path, lang);

  return {
    title,
    description,
    alternates: { canonical, languages },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}
