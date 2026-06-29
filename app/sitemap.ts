import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { localizeHref, locales, getIntlLocale } from "@/lib/i18n/config";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { buildWikiHref } from "@/lib/wiki/path";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
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

  try {
    const articles = await listPublishedArticleTreeData();

    for (const article of articles) {
      for (const locale of locales) {
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
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) {
      throw error;
    }

    console.warn(
      "[sitemap] Falling back to static routes because the database is unavailable during build.",
    );
  }

  return entries;
}

function isDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const prismaError = error as { code?: string };
  return prismaError.code === "P1001" || prismaError.code === "P1002";
}
