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
  revalidateAdminArticlePaths,
  revalidateWikiPaths,
} from "@/lib/articles/cache";

const editArticleSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  path: z.string().trim().min(1).max(500).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(12).optional(),
  editor: z.string().trim().max(40).nullable().optional(),
  markdown: z.string().min(1).optional(),
});

function joinCatchAllPath(segments: string[]): string {
  return segments.join("/").replace(/^\/+|\/+$/g, "");
}

function notFound() {
  return NextResponse.json({ error: "Article not found" }, { status: 404 });
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

    // 与后台编辑保持一致：更新内容、写修订快照、同步媒体引用、记录审计日志
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: article.id },
        data: parsed.data,
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
            ...(article.path !== updated.path ? { oldPath: article.path } : {}),
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
      { id: identity.userId, name: identity.userName, email: identity.userEmail },
    );

    // REST 写入同样要让前台与后台缓存失效，否则页面会读到旧内容
    invalidateArticleCache(article.path, result.id);
    if (article.path !== result.path) {
      invalidateArticleCache(result.path, result.id);
    }
    revalidateWikiPaths(article.path);
    if (article.path !== result.path) {
      revalidateWikiPaths(result.path);
    }
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
