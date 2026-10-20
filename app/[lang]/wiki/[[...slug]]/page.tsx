import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { WikiHtmlRenderer } from "@/components/wiki-html-renderer";
import { WikiToc } from "@/components/wiki-toc";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Page } from "@/components/ui/page-ui";
import { getPublishedArticleByPath } from "@/lib/articles";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDate } from "@/lib/i18n/format";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import {
  buildWikiCategoryHref,
  buildWikiHref,
  buildWikiTagHref,
  canonicalizeSlugSegments,
} from "@/lib/wiki/path";
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
      description: article.description,
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
  const category = article.path.split("/")[0] ?? "";
  const publishedDate = article.publishedAt
    ? formatDate(lang, article.publishedAt, {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    : null;

  return (
    <Page className="max-w-[1180px] gap-8 px-5 py-8 sm:px-8 md:px-12 md:py-10">
      <header className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {category && article.path.includes("/") ? (
            <>
              <Link
                className="transition-colors hover:text-foreground"
                href={buildWikiCategoryHref(category, lang)}
              >
                {category}
              </Link>
              <span aria-hidden className="text-border">/</span>
            </>
          ) : null}
          <span className="truncate font-mono text-[11.5px]">/{article.path}</span>
        </div>

        <h1 className="text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.025em] text-foreground sm:text-[38px]">
          {article.title}
        </h1>

        {article.description?.trim() ? (
          <p className="text-pretty text-[15.5px] leading-7 text-muted-foreground">
            {article.description.trim()}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-muted-foreground">
          {publishedDate ? (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {publishedDate}
            </span>
          ) : null}
          <span>{article.author.name}</span>
          {article.tags.length > 0 ? (
            <span className="flex flex-wrap items-center gap-1.5">
              {article.tags.map((tag) => (
                <Badge key={tag} asChild variant="secondary">
                  <Link href={buildWikiTagHref(tag, lang)}>{tag}</Link>
                </Badge>
              ))}
            </span>
          ) : null}
        </div>
      </header>

      <Separator className="bg-border/60" />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-16">
        <div className="min-w-0">
          <article className="max-w-3xl">
            {article.editor === "html" ? (
              <WikiHtmlRenderer html={article.markdown} />
            ) : (
              <MarkdownRenderer
                linkToSectionLabel={dictionary.common.linkToSection}
                markdown={article.markdown}
              />
            )}
          </article>

          <div className="max-w-3xl">
            <WikiComments
              articleId={article.id}
              articleHref={articleHref}
              dictionary={dictionary}
              lang={lang}
              searchParams={searchParams}
            />
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <WikiToc markdown={article.editor === "html" ? "" : article.markdown} />
          </div>
        </aside>
      </div>

      <ArticleJsonLd
        article={{
          title: article.title,
          markdown: article.markdown,
          description: article.description,
          path: article.path,
          publishedAt: article.publishedAt,
          updatedAt: article.updatedAt,
          authorName: article.author.name,
          tags: article.tags,
        }}
        locale={lang}
      />
      <BreadcrumbListJsonLd path={article.path} locale={lang} />
    </Page>
  );
}

function safeCanonicalize(slug?: string[]) {
  try {
    return canonicalizeSlugSegments(slug);
  } catch {
    return null;
  }
}
