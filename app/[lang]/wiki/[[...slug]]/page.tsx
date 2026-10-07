import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Calendar } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { WikiHtmlRenderer } from "@/components/wiki-html-renderer";
import { WikiToc } from "@/components/wiki-toc";
import { Badge } from "@/components/ui/badge";
import { getPublishedArticleByPath } from "@/lib/articles";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDate } from "@/lib/i18n/format";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { buildWikiHref, canonicalizeSlugSegments } from "@/lib/wiki/path";
import { buildArticleMetadata } from "@/lib/metadata";
import { ArticleJsonLd, BreadcrumbListJsonLd } from "@/lib/structured-data";
import { WikiComments } from "@/components/wiki-comments";

type Params = Promise<{ lang: string; slug?: string[] }>;
type SearchParams = Promise<{ commentsPage?: string | string[] }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { lang, slug } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const path = safeCanonicalize(slug);

  if (path === null) {
    const dictionary = await getDictionary(lang);
    return { title: dictionary.metadata.wiki };
  }

  const article = await getPublishedArticleByPath(path);

  if (!article) {
    const dictionary = await getDictionary(lang);
    return { title: dictionary.metadata.missingArticle };
  }

  return buildArticleMetadata(
    {
      title: article.title,
          markdown: article.markdown,
      path: article.path,
      tags: article.tags,
      publishedAt: article.publishedAt,
      updatedAt: article.updatedAt,
      authorName: article.author.name,
    },
    lang,
  );
}

export default async function WikiArticlePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { lang, slug } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const path = safeCanonicalize(slug);

  if (path === null || path === "") {
    redirect(localizeHref(lang, "/wiki/home"));
  }

  const [article, dictionary] = await Promise.all([
    getPublishedArticleByPath(path),
    getDictionary(lang),
  ]);

  if (!article) {
    notFound();
  }

  const articleHref = buildWikiHref(article.path, lang);
  const publishedDate = article.publishedAt
    ? formatDate(lang, article.publishedAt, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:px-8 lg:px-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-10">
        <header className="space-y-6 max-w-5xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance text-foreground">
            {article.title}
          </h1>

          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            {publishedDate ? (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{publishedDate}</span>
              </div>
            ) : null}

            {article.tags.length > 0 ? (
              article.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))
            ) : null}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_250px]">
          <div className="min-w-0">
            <article className="surface-panel md:p-12! md:shadow-xl shadow-black/5 dark:shadow-black/20 border-border/40 overflow-hidden">
              {article.editor === "html" ? (
                <WikiHtmlRenderer html={article.markdown} />
              ) : (
                <MarkdownRenderer
                  linkToSectionLabel={dictionary.common.linkToSection}
                  markdown={article.markdown}
                />
              )}
            </article>

            <WikiComments
              articleId={article.id}
              articleHref={articleHref}
              dictionary={dictionary}
              lang={lang}
              searchParams={searchParams}
            />
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <WikiToc markdown={article.editor === "html" ? "" : article.markdown} />
            </div>
          </aside>
        </div>
      </div>

      <ArticleJsonLd
        article={{
          title: article.title,
          markdown: article.markdown,
          path: article.path,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          authorName: article.author.name,
          tags: article.tags,
        }}
        locale={lang}
      />
      <BreadcrumbListJsonLd path={article.path} locale={lang} />
    </div>
  );
}

function safeCanonicalize(slug?: string[]) {
  try {
    return canonicalizeSlugSegments(slug);
  } catch {
    return null;
  }
}
