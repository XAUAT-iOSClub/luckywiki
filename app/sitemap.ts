import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { localizeHref, locales, getIntlLocale } from "@/lib/i18n/config";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { buildWikiHref } from "@/lib/wiki/path";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const articles = await listPublishedArticleTreeData();

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    const localeTag = getIntlLocale(locale);

    // Static pages
    entries.push({
      url: `${siteUrl}${localizeHref(locale, "/wiki/home")}`,
      changeFrequency: "monthly",
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [getIntlLocale(l), `${siteUrl}${localizeHref(l, "/wiki/home")}`]),
        ),
      },
    });

    entries.push({
      url: `${siteUrl}${localizeHref(locale, "/agent")}`,
      changeFrequency: "monthly",
      alternates: {
        languages: Object.fromEntries(
          locales.map((l) => [getIntlLocale(l), `${siteUrl}${localizeHref(l, "/agent")}`]),
        ),
      },
    });
  }

  // Article pages — one entry per (locale, article)
  for (const article of articles) {
    for (const locale of locales) {
      const localeTag = getIntlLocale(locale);
      const wikiPath = buildWikiHref(article.path, locale);

      entries.push({
        url: `${siteUrl}${wikiPath}`,
        lastModified: article.updatedAt,
        changeFrequency: "weekly",
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [
              getIntlLocale(l),
              `${siteUrl}${buildWikiHref(article.path, l)}`,
            ]),
          ),
        },
      });
    }
  }

  return entries;
}
