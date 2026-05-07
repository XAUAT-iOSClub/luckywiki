import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createCommentAction } from "@/app/actions/comments";
import { CommentForm } from "@/components/comment-form";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SignOutButton } from "@/components/sign-out-button";
import { WikiTreeNav } from "@/components/wiki-tree-nav";
import { buildWikiTree } from "@/lib/wiki-tree";
import { buildWikiHref, canonicalizeSlugSegments } from "@/lib/wiki-path";
import { extractMarkdownDescription } from "@/lib/text";
import { getCurrentSession } from "@/lib/session";
import { getPublishedArticleByPath, listPublishedArticleTreeData } from "@/lib/articles";
import { canComment, canManageWiki } from "@/lib/permissions";

type Params = Promise<{ slug?: string[] }>;

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const path = safeCanonicalize(slug);

  if (path === null) {
    return {
      title: "Wiki",
    };
  }

  const article = await getPublishedArticleByPath(path);

  if (!article) {
    return {
      title: "Missing article",
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
  const { slug } = await params;
  const path = safeCanonicalize(slug);

  if (path === null) {
    notFound();
  }

  const [article, treeArticles, session] = await Promise.all([
    getPublishedArticleByPath(path),
    listPublishedArticleTreeData(),
    getCurrentSession(),
  ]);

  if (!article) {
    notFound();
  }

  const tree = buildWikiTree(treeArticles);
  const canPostComment = canComment(session?.user ?? null);
  const isAdmin = canManageWiki(session?.user ?? null);
  const articleHref = buildWikiHref(article.path);

  return (
    <div className="min-h-screen px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:flex-row">
        <aside className="surface-panel lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-[300px] lg:overflow-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">LuckyWiki</p>
                <h1 className="text-xl font-semibold">Published pages</h1>
              </div>
              {isAdmin ? (
                <Link className="button-secondary" href="/admin/articles">
                  Admin
                </Link>
              ) : null}
            </div>
            <WikiTreeNav currentPath={article.path} tree={tree} />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <header className="surface-panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <p className="eyebrow">Wiki Article</p>
              <h2 className="text-3xl font-semibold text-balance">{article.title}</h2>
              <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>Path: {article.path || "(root)"}</span>
                <span>Author: {article.author.name}</span>
                {article.publishedAt ? <span>Published: {article.publishedAt.toLocaleDateString()}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {session ? (
                <>
                  <span className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">
                    {session.user.name}
                  </span>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link className="button-secondary" href={`/auth/sign-in?next=${encodeURIComponent(articleHref)}`}>
                    Sign in
                  </Link>
                  <Link className="button-primary" href={`/auth/sign-up?next=${encodeURIComponent(articleHref)}`}>
                    Create account
                  </Link>
                </>
              )}
            </div>
          </header>

          <article className="surface-panel">
            <MarkdownRenderer markdown={article.markdown} />
          </article>

          <section className="surface-panel space-y-6">
            <div>
              <p className="eyebrow">Comments</p>
              <h3 className="text-2xl font-semibold">Reader discussion</h3>
            </div>

            {canPostComment ? (
              <CommentForm
                action={createCommentAction.bind(null, article.id, articleHref)}
                initialState={{}}
              />
            ) : (
              <div className="rounded-3xl border border-dashed border-border p-5 text-sm leading-7 text-muted-foreground">
                {session
                  ? "Verify your email before posting comments."
                  : "Sign in and verify your email to join the discussion."}
              </div>
            )}

            <div className="space-y-4">
              {article.comments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  No approved comments yet.
                </div>
              ) : null}
              {article.comments.map((comment) => (
                <article key={comment.id} className="rounded-3xl border border-border/70 bg-white/70 p-5 shadow-sm shadow-slate-200/30">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{comment.author.name}</span>
                    <span className="text-xs text-muted-foreground">{comment.createdAt.toLocaleString()}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{comment.body}</p>
                </article>
              ))}
            </div>
          </section>
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
