import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ArticleStatus, LogAction } from "@/generated/prisma/enums";
import { validateMcpApiKey } from "@/lib/mcp/auth";
import { checkPublicApiRateLimit, rateLimitExceededResponse } from "@/lib/mcp/rate-limit";
import { canWriteArticles } from "@/lib/auth/permissions";
import {
  dispatchWebhookEventAfterResponse,
  WEBHOOK_EVENTS,
} from "@/lib/webhook/delivery";
import { snapshotArticleRevision } from "@/lib/articles/revisions";
import { syncArticleMediaReferences } from "@/lib/media/references";
import { enqueueArticleEmbeddingSync } from "@/lib/embedding-queue";
import {
  invalidateArticleCache,
  invalidatePathChangeCaches,
  revalidateAdminArticlePaths,
  revalidateWikiPaths,
} from "@/lib/articles/cache";
import {
  applyPathChange,
  getPathChangeCacheInput,
  publishPathChangeSideEffects,
} from "@/lib/articles/path-change";
import { resolveWikiPath } from "@/lib/articles/redirects";
import { canonicalizePath } from "@/lib/wiki/path";
import type { PathChangeFailure } from "@/lib/articles/path-change";

const editArticleSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  path: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
  editor: z.string().trim().max(40).nullable().optional(),
  markdown: z.string().min(1).optional(),
  /** 是否同时重写其他文章里的旧链接，默认开启 */
  rewriteLinks: z.boolean().optional(),
});

function joinCatchAllPath(segments: string[]): string {
  return segments.join("/").replace(/^\/+|\/+$/g, "");
}

function encodeArticlePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function notFound() {
  return NextResponse.json({ error: "Article not found" }, { status: 404 });
}

function pathChangeErrorResponse(failure: PathChangeFailure) {
  if (failure.status === "conflict") {
    return NextResponse.json(
      { error: "Article path already exists", conflictPath: failure.conflictPath },
      { status: 409 },
    );
  }

  if (failure.status === "not-found") {
    return notFound();
  }

  return NextResponse.json(
    { error: "Invalid path change", reason: failure.status },
    { status: 400 },
  );
}

// GET /api/v1/articles/[...path] — 获取单篇公开文章
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    // 与列表接口一致：可选认证 + 限流
    const identity = await validateMcpApiKey(request);
    const resetAt = await checkPublicApiRateLimit(identity, request);
    if (resetAt) {
      return rateLimitExceededResponse(resetAt);
    }

    const { path: segments } = await params;
    const articlePath = joinCatchAllPath(segments);

    if (!articlePath) {
      return notFound();
    }

    const article = await prisma.article.findFirst({
      where: {
        path: articlePath,
        status: ArticleStatus.PUBLISHED,
      },
      select: {
        id: true,
        path: true,
        title: true,
        description: true,
        tags: true,
        editor: true,
        markdown: true,
        status: true,
        publishedAt: true,
        updatedAt: true,
        author: {
          select: { name: true },
        },
      },
    });

    if (!article) {
      // Old paths answer with a real 308 so clients keep working after a move.
      const resolution = await resolveWikiPath(articlePath);

      if (resolution.type === "redirect") {
        const redirectUrl = new URL(
          `/api/v1/articles/${encodeArticlePath(resolution.path)}`,
          request.url,
        );
        redirectUrl.search = request.nextUrl.search;

        return NextResponse.redirect(redirectUrl, 308);
      }

      if (resolution.type === "gone") {
        return NextResponse.json({ error: "Article is archived" }, { status: 410 });
      }

      return notFound();
    }

    return NextResponse.json({ data: article });
  } catch (error) {
    console.error("[api/v1/articles/:path GET]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT /api/v1/articles/[...path] — 更新文章（需 AUTHOR 权限）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const identity = await validateMcpApiKey(request);
    if (!identity || identity.type !== "api-key") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!canWriteArticles({ role: identity.userRole, emailVerified: true })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { path: segments } = await params;
    const articlePath = joinCatchAllPath(segments);
    if (!articlePath) return notFound();

    const article = await prisma.article.findFirst({
      where: { path: articlePath },
      select: { id: true, path: true, status: true },
    });
    if (!article) return notFound();

    const body = await request.json().catch(() => ({}));
    const parsed = editArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const { path: requestedPath, rewriteLinks = true, ...articleData } = parsed.data;
    let normalizedPath = article.path;

    if (requestedPath !== undefined) {
      try {
        normalizedPath = canonicalizePath(requestedPath.trim());
      } catch {
        return NextResponse.json({ error: "Invalid article path" }, { status: 400 });
      }

      if (!normalizedPath) {
        return NextResponse.json({ error: "Invalid article path" }, { status: 400 });
      }
    }

    const actor = {
      id: identity.userId,
      name: identity.userName,
      email: identity.userEmail,
    };

    // A path change is a move: cascade the subtree, write redirects and (by
    // default) rewrite internal links, all in one transaction.
    if (normalizedPath !== article.path) {
      const result = await applyPathChange({
        target: { kind: "article", articleId: article.id },
        nextPathInput: normalizedPath,
        actorId: identity.userId,
        source: "rest-api",
        rewriteLinks,
        primaryData: articleData,
      });

      if (result.status !== "ok") {
        return pathChangeErrorResponse(result);
      }

      await publishPathChangeSideEffects(result, actor);
      invalidatePathChangeCaches(
        {
          ...getPathChangeCacheInput(result),
          rewrittenPaths: result.rewrittenArticles.map((item) => item.path),
          rewrittenArticleIds: result.rewrittenArticles.map((item) => item.id),
        },
        { mode: "route" },
      );

      return NextResponse.json({
        data: {
          id: result.primaryArticleId,
          path: result.nextPath,
          title: result.primaryArticle?.title ?? null,
          status: result.primaryArticle?.status ?? null,
          oldPath: result.currentPath,
          movedCount: result.moves.length,
          redirectsCreated: result.redirectsCreated,
          linkRewriteCount: result.linkRewriteCount,
        },
      });
    }

    // 与后台编辑保持一致：更新内容、写修订快照、同步媒体引用、记录审计日志
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: article.id },
        data: { ...articleData, path: normalizedPath },
      });

      await snapshotArticleRevision(tx, updated, identity.userId);
      await syncArticleMediaReferences(tx, updated.id, updated.markdown);
      await tx.log.create({
        data: {
          action: LogAction.UPDATE_ARTICLE,
          targetType: "Article",
          targetId: updated.id,
          detail: JSON.stringify({
            title: updated.title,
            path: updated.path,
            status: updated.status,
            source: "rest-api",
          }),
          userId: identity.userId,
        },
      });

      return {
        id: updated.id,
        path: updated.path,
        title: updated.title,
        status: updated.status,
        updatedAt: updated.updatedAt,
      };
    });

    try {
      await enqueueArticleEmbeddingSync({
        articleId: result.id,
        updatedAt: result.updatedAt.toISOString(),
      });
    } catch (error) {
      // 入队失败不能影响已经成功的写入
      console.warn("[api/v1/articles/:path PUT] embedding enqueue failed", error);
    }

    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_UPDATED,
      {
        id: result.id, path: result.path, title: result.title, status: result.status,
      },
      actor,
    );

    // REST 写入同样要让前台与后台缓存失效，否则页面会读到旧内容
    invalidateArticleCache(result.path, result.id);
    revalidateWikiPaths(result.path);
    revalidateAdminArticlePaths(result.id);

    return NextResponse.json({ data: result });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Article path already exists" }, { status: 409 });
    }
    console.error("[api/v1/articles/:path PUT]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/v1/articles/[...path] — 归档文章（软删除，需 AUTHOR）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const identity = await validateMcpApiKey(request);
    if (!identity || identity.type !== "api-key") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!canWriteArticles({ role: identity.userRole, emailVerified: true })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { path: segments } = await params;
    const articlePath = joinCatchAllPath(segments);
    if (!articlePath) return notFound();

    const article = await prisma.article.findFirst({
      where: { path: articlePath },
      select: { id: true, path: true, title: true, status: true },
    });
    if (!article) return notFound();

    if (article.status === ArticleStatus.ARCHIVED) {
      return NextResponse.json({ ok: true, archived: true });
    }

    await prisma.$transaction(async (tx) => {
      await tx.article.update({
        where: { id: article.id },
        data: { status: ArticleStatus.ARCHIVED },
      });

      await tx.log.create({
        data: {
          action: LogAction.ARCHIVE_ARTICLE,
          targetType: "Article",
          targetId: article.id,
          detail: JSON.stringify({
            title: article.title,
            path: article.path,
            source: "rest-api",
          }),
          userId: identity.userId,
        },
      });
    });

    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_ARCHIVED,
      {
        id: article.id,
        path: article.path,
        title: article.title,
        status: ArticleStatus.ARCHIVED,
      },
      { id: identity.userId, name: identity.userName, email: identity.userEmail },
    );

    try {
      await enqueueArticleEmbeddingSync({
        articleId: article.id,
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      // 归档已成功，索引同步失败只记录，不影响接口结果
      console.warn("[api/v1/articles/:path DELETE] embedding enqueue failed", error);
    }

    // 归档后文章会从公开列表和详情消失，必须立即让缓存失效
    invalidateArticleCache(article.path, article.id);
    revalidateWikiPaths(article.path);
    revalidateAdminArticlePaths(article.id);

    return NextResponse.json({ ok: true, archived: true });
  } catch (error) {
    console.error("[api/v1/articles/:path DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
