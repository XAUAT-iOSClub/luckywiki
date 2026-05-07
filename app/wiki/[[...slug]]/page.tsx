import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createCommentAction } from "@/app/actions/comments";
import { CommentForm } from "@/components/comment-form";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SignOutButton } from "@/components/sign-out-button";
import { buildWikiHref, canonicalizeSlugSegments } from "@/lib/wiki-path";
import { extractMarkdownDescription } from "@/lib/text";
import { getCurrentSession } from "@/lib/session";
import { getPublishedArticleByPath } from "@/lib/articles";
import { canComment } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, User, Hash, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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

  const [article, session] = await Promise.all([
    getPublishedArticleByPath(path),
    getCurrentSession(),
  ]);

  if (!article) {
    notFound();
  }

  const canPostComment = canComment(session?.user ?? null);
  const articleHref = buildWikiHref(article.path);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:px-8 lg:px-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-10">
        {/* Article Header */}
        <header className="space-y-6">
          <div className="space-y-4">
            <Badge variant="secondary" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-widest font-bold bg-primary/10 text-primary border-none">
              Wiki Article
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance text-foreground">
              {article.title}
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50">
                <User className="h-4 w-4" />
              </div>
              <span className="font-medium">{article.author.name}</span>
            </div>
            
            {article.publishedAt && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>{article.publishedAt.toLocaleDateString("en-US", { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              <code className="bg-muted/50 px-2 py-0.5 rounded text-xs">{article.path || "root"}</code>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <article className="surface-panel !p-8 md:!p-12 !rounded-[2.5rem] shadow-xl shadow-black/5 dark:shadow-black/20 border-border/40">
          <MarkdownRenderer markdown={article.markdown} />
        </article>

        {/* Comments Section */}
        <section className="space-y-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Discussion</h2>
              <p className="text-sm text-muted-foreground">{article.comments.length} comments</p>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
            <div className="space-y-6">
              {article.comments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-border/60 p-10 text-center">
                  <p className="text-sm text-muted-foreground italic">No comments yet. Be the first to start the conversation.</p>
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
                            <p className="text-xs text-muted-foreground">{comment.createdAt.toLocaleDateString()}</p>
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

            <aside className="space-y-6">
              <div className="sticky top-24">
                <div className="rounded-[2rem] border border-border/50 bg-muted/30 p-6 backdrop-blur-sm">
                  <h3 className="font-bold mb-4">Join the discussion</h3>
                  {canPostComment ? (
                    <CommentForm
                      action={createCommentAction.bind(null, article.id, articleHref)}
                      initialState={{}}
                    />
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {session
                          ? "Please verify your email address to post comments on this article."
                          : "Sign in to your account to participate in the discussion and share your thoughts."}
                      </p>
                      {!session && (
                        <Button asChild className="w-full rounded-xl">
                          <Link href={`/auth/sign-in?next=${encodeURIComponent(articleHref)}`}>
                            Sign In
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </section>
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
