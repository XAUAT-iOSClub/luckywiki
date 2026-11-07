import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ArticleStatus } from "@/generated/prisma/enums";
import { validateMcpApiKey } from "@/lib/mcp/auth";
import { checkPublicApiRateLimit, rateLimitExceededResponse } from "@/lib/mcp/rate-limit";

// GET /api/v1/taxonomy — 获取所有标签和栏目
export async function GET(request: NextRequest) {
  try {
    // 与文章列表一致：可选认证 + 限流
    const identity = await validateMcpApiKey(request);
    const resetAt = await checkPublicApiRateLimit(identity);
    if (resetAt) {
      return rateLimitExceededResponse(resetAt);
    }

    const [tags, sections] = await Promise.all([
      prisma.article.findMany({
        where: { status: ArticleStatus.PUBLISHED },
        select: { tags: true },
      }),
      prisma.article.groupBy({
        by: ["path"],
        where: { status: ArticleStatus.PUBLISHED },
        _count: { _all: true },
      }),
    ]);

    // 聚合标签
    const tagCount = new Map<string, number>();
    for (const article of tags) {
      for (const tag of article.tags) {
        tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
      }
    }

    // 聚合栏目（path 第一段）
    const sectionCount = new Map<string, number>();
    for (const row of sections) {
      const parts = row.path.split("/").filter(Boolean);
      if (parts.length > 1) {
        const section = parts[0];
        sectionCount.set(section, (sectionCount.get(section) ?? 0) + (row._count._all ?? 0));
      }
    }

    return NextResponse.json({
      data: {
        tags: Array.from(tagCount.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        sections: Array.from(sectionCount.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
      },
    });
  } catch (error) {
    console.error("[api/v1/taxonomy]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
