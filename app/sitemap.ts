import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { localizeHref, locales, getIntlLocale } from "@/lib/i18n/config";
import { listPublishedArticleTreeData, listPublishedTaxonomy } from "@/lib/articles";
import { buildWikiCategoryHref, buildWikiHref, buildWikiTagHref } from "@/lib/wiki/path";

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

    for (const taxonomyPath of ["/wiki/tag", "/wiki/category"]) {
      entries.push({
        url: `${siteUrl}${localizeHref(locale, taxonomyPath)}`,
        changeFrequency: "weekly",
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [getIntlLocale(l), `${siteUrl}${localizeHref(l, taxonomyPath)}`]),
          ),
        },
      });
    }
  }

  try {
    const [articles, taxonomy] = await Promise.all([
      listPublishedArticleTreeData(),
      listPublishedTaxonomy(),
    ]);

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

    for (const section of taxonomy.sections) {
      for (const locale of locales) {
        const categoryPath = buildWikiCategoryHref(section.slug, locale);
        entries.push({
          url: `${siteUrl}${categoryPath}`,
          changeFrequency: "weekly",
          alternates: {
            languages: Object.fromEntries(
              locales.map((l) => [
                getIntlLocale(l),
                `${siteUrl}${buildWikiCategoryHref(section.slug, l)}`,
              ]),
            ),
          },
        });
      }
    }

    for (const tag of taxonomy.tags) {
      for (const locale of locales) {
        const tagPath = buildWikiTagHref(tag.tag, locale);
        entries.push({
          url: `${siteUrl}${tagPath}`,
          changeFrequency: "weekly",
          alternates: {
            languages: Object.fromEntries(
              locales.map((l) => [
                getIntlLocale(l),
                `${siteUrl}${buildWikiTagHref(tag.tag, l)}`,
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
