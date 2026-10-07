import Link from "next/link";
import { Suspense } from "react";
import { MessageCircle } from "lucide-react";
import { createCommentAction } from "@/app/actions/comments";
import { CommentForm } from "@/components/comment-form";
import { Button } from "@/components/ui/button";
import { canComment } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { listPublishedArticleComments } from "@/lib/articles";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import { formatDate, formatNumber, formatTemplate } from "@/lib/i18n/format";
import { localizeHref, type Locale } from "@/lib/i18n/config";

type CommentSearchParams = Promise<{ commentsPage?: string | string[] }>;

export function WikiComments({
  articleId,
  articleHref,
  dictionary,
  lang,
  searchParams,
}: {
  articleId: string;
  articleHref: string;
  dictionary: Dictionary;
  lang: Locale;
  searchParams: CommentSearchParams;
}) {
  return (
    <Suspense fallback={<CommentsSkeleton />}>
      <WikiCommentsContent
        articleId={articleId}
        articleHref={articleHref}
        dictionary={dictionary}
        lang={lang}
        searchParams={searchParams}
      />
    </Suspense>
  );
}

async function WikiCommentsContent({
  articleId,
  articleHref,
  dictionary,
  lang,
  searchParams,
}: {
  articleId: string;
  articleHref: string;
  dictionary: Dictionary;
  lang: Locale;
  searchParams: CommentSearchParams;
}) {
  const params = await searchParams;
  const requestedPage = Array.isArray(params.commentsPage)
    ? params.commentsPage[0]
    : params.commentsPage;
  const page = Math.max(1, Number.parseInt(requestedPage ?? "1", 10) || 1);
  const comments = await listPublishedArticleComments(articleId, page);

  return (
    <section className="mt-16 space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{dictionary.wiki.discussion}</h2>
          <p className="text-sm text-muted-foreground">
            {formatTemplate(dictionary.wiki.commentCount, {
              count: formatNumber(lang, comments.totalCount),
            })}
          </p>
        </div>
      </div>

      <div className="grid gap-8">
        <div className="space-y-6">
          {comments.totalCount === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center">
              <p className="text-sm text-muted-foreground italic">{dictionary.wiki.noComments}</p>
            </div>
          ) : (
            <>
              <div className="space-y-6">
                {comments.comments.map((comment) => (
                  <article key={comment.id} className="group rounded-3xl border border-border/50 bg-card/50 p-6 shadow-sm transition-all hover:shadow-md dark:bg-zinc-900/40">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 font-bold text-primary">
                          {comment.author.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{comment.author.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(lang, comment.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{comment.body}</p>
                  </article>
                ))}
              </div>
              <CommentPagination
                articleHref={articleHref}
                dictionary={dictionary}
                page={comments.page}
                totalPages={comments.totalPages}
              />
            </>
          )}
        </div>

        <Suspense fallback={<div className="h-36 rounded-[2rem] border border-border/50 bg-muted/30" />}>
          <CommentComposer articleId={articleId} articleHref={articleHref} dictionary={dictionary} lang={lang} />
        </Suspense>
      </div>
    </section>
  );
}

function CommentPagination({
  articleHref,
  dictionary,
  page,
  totalPages,
}: {
  articleHref: string;
  dictionary: Dictionary;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const hrefFor = (targetPage: number) => `${articleHref}?commentsPage=${targetPage}`;

  return (
    <nav aria-label={dictionary.wiki.discussion} className="flex items-center justify-between gap-3">
      {page > 1 ? <Button asChild variant="outline"><Link href={hrefFor(page - 1)}>{dictionary.common.previous}</Link></Button> : <span />}
      <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
      {page < totalPages ? <Button asChild variant="outline"><Link href={hrefFor(page + 1)}>{dictionary.common.next}</Link></Button> : <span />}
    </nav>
  );
}

async function CommentComposer({
  articleId,
  articleHref,
  dictionary,
  lang,
}: {
  articleId: string;
  articleHref: string;
  dictionary: Dictionary;
  lang: Locale;
}) {
  const session = await getCurrentSession();
  const canPostComment = canComment(session?.user ?? null);

  return (
    <div className="w-full rounded-[2rem] border border-border/50 bg-muted/30 p-6 backdrop-blur-sm">
      <h3 className="mb-4 font-bold">{dictionary.wiki.joinDiscussion}</h3>
      {canPostComment ? (
        <CommentForm action={createCommentAction.bind(null, lang, articleId, articleHref)} initialState={{}} />
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
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
  );
}

function CommentsSkeleton() {
  return <div className="mt-16 h-48 animate-pulse rounded-3xl bg-muted/40" />;
}
