import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Calendar, Hash, MessageCircle, User } from "lucide-react";
import { createCommentAction } from "@/app/actions/comments";
import { CommentForm } from "@/components/comment-form";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { WikiToc } from "@/components/wiki-toc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublishedArticleByPath } from "@/lib/articles";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { formatDate, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { hasLocale, localizeHref } from "@/lib/i18n/config";
import { buildWikiHref, canonicalizeSlugSegments } from "@/lib/wiki/path";
import { canComment } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { extractMarkdownDescription } from "@/lib/text";

type Params = Promise<{ lang: string; slug?: string[] }>;

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
    return {
      title: (await getDictionary(lang)).metadata.wiki,
    };
  }

  const article = await getPublishedArticleByPath(path);

  if (!article) {
    return {
      title: (await getDictionary(lang)).metadata.missingArticle,
    };
  }

  return {
    title: article.title,
    description: extractMarkdownDescription(article.markdown),
  };
}

export default async function WikiArticlePage({
  params,
}: {
  params: Params;
}) {
  const { lang, slug } = await params;

  if (!hasLocale(lang)) {
    notFound();
  }

  const path = safeCanonicalize(slug);

  if (path === null) {
    notFound();
  }

  const [article, session, dictionary] = await Promise.all([
    getPublishedArticleByPath(path),
    getCurrentSession(),
    getDictionary(lang),
  ]);

  if (!article) {
    notFound();
  }

  const canPostComment = canComment(session?.user ?? null);
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
              <MarkdownRenderer
                linkToSectionLabel={dictionary.common.linkToSection}
                markdown={article.markdown}
              />
            </article>

            <section className="mt-16 space-y-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">{dictionary.wiki.discussion}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatTemplate(dictionary.wiki.commentCount, {
                      count: formatNumber(lang, article.comments.length),
                    })}
                  </p>
                </div>
              </div>

              <div className="grid gap-8">
                <div className="space-y-6">
                  {article.comments.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center">
                      <p className="text-sm text-muted-foreground italic">{dictionary.wiki.noComments}</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {article.comments.map((comment) => (
                        <article key={comment.id} className="group rounded-3xl border border-border/50 bg-card/50 p-6 shadow-sm transition-all hover:shadow-md dark:bg-zinc-900/40">
                          <div className="flex items-center justify-between gap-2 mb-4">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center font-bold text-primary">
                                {comment.author.name.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{comment.author.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {formatDate(lang, comment.createdAt)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <p className="text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                            {comment.body}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>

                <div className="max-w-xl">
                  <div className="rounded-[2rem] border border-border/50 bg-muted/30 p-6 backdrop-blur-sm">
                    <h3 className="font-bold mb-4">{dictionary.wiki.joinDiscussion}</h3>
                    {canPostComment ? (
                      <CommentForm
                        action={createCommentAction.bind(null, lang, article.id, articleHref)}
                        initialState={{}}
                      />
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {session ? dictionary.wiki.verifyToComment : dictionary.wiki.signInToDiscuss}
                        </p>
                        {!session ? (
                          <Button asChild className="w-full rounded-xl">
                            <Link href={`${localizeHref(lang, "/auth/sign-in")}?next=${encodeURIComponent(articleHref)}`}>
                              {dictionary.common.signIn}
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <WikiToc markdown={article.markdown} />
            </div>
          </aside>
        </div>
      </div>
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
