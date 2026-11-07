import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
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

const PAGE_SIZE = 20;

const listQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(100).optional(),
  section: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(100).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(PAGE_SIZE),
});

export async function GET(request: NextRequest) {
  try {
    // 认证（可选，匿名也能访问，但限流更严）
    const identity = await validateMcpApiKey(request);
    const resetAt = await checkPublicApiRateLimit(identity, request);
    if (resetAt) {
      return rateLimitExceededResponse(resetAt);
    }

    // 解析查询参数
    const url = new URL(request.url);
    const parsed = listQuerySchema.safeParse({
      q: url.searchParams.get("q") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      section: url.searchParams.get("section") ?? undefined,
      page: url.searchParams.get("page") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { q, tag, section, page, limit } = parsed.data;
    const skip = (page - 1) * limit;

    // 构建 where 条件（只返回 PUBLISHED）
    const where: Prisma.ArticleWhereInput = { status: ArticleStatus.PUBLISHED };
    // q / section 各自内部是 OR，彼此之间必须 AND，避免组合筛选时结果互相泄漏
    const andConditions: Prisma.ArticleWhereInput[] = [];

    if (q) {
      andConditions.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { markdown: { contains: q, mode: "insensitive" } },
        ],
      });
    }
    if (tag) {
      where.tags = { has: tag };
    }
    if (section) {
      // section = path 的第一段
      const prefix = section.endsWith("/") ? section : `${section}/`;
      andConditions.push({
        OR: [{ path: section }, { path: { startsWith: prefix } }],
      });
    }
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [articles, total] = await Promise.all([
      prisma.article.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          path: true,
          title: true,
          description: true,
          tags: true,
          status: true,
          publishedAt: true,
          updatedAt: true,
        },
      }),
      prisma.article.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data: articles,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error("[api/v1/articles]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// POST /api/v1/articles — 创建文章（需 AUTHOR 权限）
const createArticleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  path: z.string().trim().min(1).max(500),
  description: z.string().trim().max(280).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(12).optional().default([]),
  editor: z.string().trim().max(40).optional(),
  markdown: z.string().min(1),
  status: z.enum([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED]).optional().default(ArticleStatus.DRAFT),
});

export async function POST(request: NextRequest) {
  try {
    const identity = await validateMcpApiKey(request);
    if (!identity || identity.type !== "api-key") {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!canWriteArticles({ role: identity.userRole, emailVerified: true })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = createArticleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // 检查 path 冲突
    const existing = await prisma.article.findUnique({
      where: { path: data.path },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Article path already exists" },
        { status: 409 },
      );
    }

    // 与后台创建保持一致：写修订快照、同步媒体引用、记录审计日志
    const article = await prisma.$transaction(async (tx) => {
      const created = await tx.article.create({
        data: {
          ...data,
          authorId: identity.userId,
          publishedAt: data.status === ArticleStatus.PUBLISHED ? new Date() : null,
        },
      });

      await snapshotArticleRevision(tx, created, identity.userId, { force: true });
      await syncArticleMediaReferences(tx, created.id, created.markdown);
      await tx.log.create({
        data: {
          action: LogAction.CREATE_ARTICLE,
          targetType: "Article",
          targetId: created.id,
          detail: JSON.stringify({
            title: created.title,
            path: created.path,
            status: created.status,
            source: "rest-api",
          }),
          userId: identity.userId,
        },
      });

      return {
        id: created.id,
        path: created.path,
        title: created.title,
        status: created.status,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    });

    try {
      await enqueueArticleEmbeddingSync({
        articleId: article.id,
        updatedAt: article.updatedAt.toISOString(),
      });
    } catch (error) {
      // 入队失败不能影响已经成功的写入
      console.warn("[api/v1/articles POST] embedding enqueue failed", error);
    }

    // 任何新建都发 article.created；直接以已发布创建时追加 article.published
    const actor = { id: identity.userId, name: identity.userName, email: identity.userEmail };
    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_CREATED,
      {
        id: article.id, path: article.path, title: article.title, status: article.status,
      },
      actor,
    );
    if (article.status === ArticleStatus.PUBLISHED) {
      dispatchWebhookEventAfterResponse(
        WEBHOOK_EVENTS.ARTICLE_PUBLISHED,
        {
          id: article.id, path: article.path, title: article.title, status: article.status,
        },
        actor,
      );
    }

    invalidateArticleCache(article.path, article.id);
    revalidateWikiPaths(article.path);
    revalidateAdminArticlePaths(article.id);

    return NextResponse.json({ data: article }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Article path already exists" }, { status: 409 });
    }
    console.error("[api/v1/articles POST]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
