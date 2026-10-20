import Link from "next/link";
import { Suspense } from "react";
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
    <section className="mt-14 border-t border-border/60 pt-10">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-foreground">
            {dictionary.wiki.discussion}
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {formatTemplate(dictionary.wiki.commentCount, {
              count: formatNumber(lang, comments.totalCount),
            })}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {comments.totalCount === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 px-5 py-10 text-center">
            <p className="text-[13px] text-muted-foreground">
              {dictionary.wiki.noComments}
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-card">
              {comments.comments.map((comment) => (
                <article className="px-5 py-4" key={comment.id}>
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-medium text-muted-foreground">
                      {comment.author.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-foreground">
                        {comment.author.name}
                      </p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {formatDate(lang, comment.createdAt)}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-6 text-foreground/85">
                    {comment.body}
                  </p>
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

        <Suspense fallback={<div className="h-36 rounded-lg border border-border/70 bg-muted/20" />}>
          <CommentComposer
            articleHref={articleHref}
            articleId={articleId}
            dictionary={dictionary}
            lang={lang}
          />
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
    <nav
      aria-label={dictionary.wiki.discussion}
      className="flex items-center justify-between gap-3"
    >
      {page > 1 ? (
        <Button asChild size="sm" variant="outline">
          <Link href={hrefFor(page - 1)}>{dictionary.common.previous}</Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-[12px] tabular-nums text-muted-foreground">
        {page} / {totalPages}
      </span>
      {page < totalPages ? (
        <Button asChild size="sm" variant="outline">
          <Link href={hrefFor(page + 1)}>{dictionary.common.next}</Link>
        </Button>
      ) : (
        <span />
      )}
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
    <div className="rounded-lg border border-border/70 bg-card p-5">
      <h3 className="text-[14px] font-semibold text-foreground">
        {dictionary.wiki.joinDiscussion}
      </h3>
      <div className="mt-4">
        {canPostComment ? (
          <CommentForm
            action={createCommentAction.bind(null, lang, articleId, articleHref)}
            initialState={{}}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-[13px] leading-6 text-muted-foreground">
              {session ? dictionary.wiki.verifyToComment : dictionary.wiki.signInToDiscuss}
            </p>
            {!session ? (
              <Button asChild size="sm">
                <Link
                  href={`${localizeHref(lang, "/auth/sign-in")}?next=${encodeURIComponent(articleHref)}`}
                >
                  {dictionary.common.signIn}
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsSkeleton() {
  return <div className="mt-14 h-44 animate-pulse rounded-lg bg-muted/40" />;
}
