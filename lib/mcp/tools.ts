import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ArticleStatus } from "@/generated/prisma/enums";
import { searchArticles } from "@/lib/search";
import { extractMarkdownDescription } from "@/lib/text";

/**
 * MCP 工具定义
 * 所有工具只返回 PUBLISHED 状态的文章，不碰 Agent，不做写操作
 */

// ---------- 工具定义 ----------

export const mcpTools = [
  {
    name: "search_wiki",
    description: "全文搜索百科文章，按相关度排序。支持标题、描述、正文内容的模糊匹配。",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        page: {
          type: "number",
          description: "页码，默认 1",
          minimum: 1,
        },
        pageSize: {
          type: "number",
          description: "每页数量，默认 10，最大 20",
          minimum: 1,
          maximum: 20,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_article",
    description: "根据文章路径获取文章详情，包含完整 Markdown 内容、作者、标签等信息。",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "文章路径，例如 'software/intro' 或 'home'",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_wiki_tree",
    description: "获取百科的文章目录树（已发布文章的路径和标题列表），用于了解整体结构。",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "list_recent_articles",
    description: "获取最近更新的已发布文章列表。",
    inputSchema: {
      type: "object" as const,
      properties: {
        limit: {
          type: "number",
          description: "返回数量，默认 5，最大 20",
          minimum: 1,
          maximum: 20,
        },
      },
    },
  },
  {
    name: "get_related_articles",
    description: "根据指定文章查找相关文章（按标签和所属分类匹配）。",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "参考文章的路径",
        },
        limit: {
          type: "number",
          description: "返回数量，默认 5，最大 10",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_categories",
    description: "获取百科的分类统计（按一级路径分组），了解每个分类下有多少文章。",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// ---------- 输入参数校验 Schema ----------

const searchSchema = z.object({
  query: z.string().min(1).max(200),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(20).optional().default(10),
});

const getArticleSchema = z.object({
  path: z.string().min(1).max(200),
});

const listRecentSchema = z.object({
  limit: z.number().int().min(1).max(20).optional().default(5),
});

const getRelatedSchema = z.object({
  path: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(10).optional().default(5),
});

// ---------- 工具实现 ----------

export async function callTool(name: string, args: unknown): Promise<unknown> {
  switch (name) {
    case "search_wiki":
      return searchWiki(searchSchema.parse(args));
    case "get_article":
      return getArticle(getArticleSchema.parse(args));
    case "list_wiki_tree":
      return listWikiTree();
    case "list_recent_articles":
      return listRecentArticles(listRecentSchema.parse(args));
    case "get_related_articles":
      return getRelatedArticles(getRelatedSchema.parse(args));
    case "list_categories":
      return listCategories();
    default:
      // 调用方已经检查过了，这里是兜底
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------- 各工具实现 ----------

async function searchWiki({ query, page, pageSize }: z.infer<typeof searchSchema>) {
  const results = await searchArticles({ query, page, pageSize });
  return {
    query: results.query,
    totalCount: results.totalCount,
    page: results.page,
    pageSize: results.pageSize,
    totalPages: results.totalPages,
    articles: results.results.map((r) => ({
      id: r.id,
      path: r.path,
      title: r.title,
      description: r.description,
      tags: r.tags,
      excerpt: r.excerpt,
      updatedAt: r.updatedAt.toISOString(),
      score: r.score,
    })),
  };
}

async function getArticle({ path }: z.infer<typeof getArticleSchema>) {
  const article = await prisma.article.findFirst({
    where: {
      path,
      status: ArticleStatus.PUBLISHED,
    },
    select: {
      id: true,
      path: true,
      title: true,
      description: true,
      tags: true,
      markdown: true,
      createdAt: true,
      updatedAt: true,
      publishedAt: true,
      author: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          comments: true,
        },
      },
    },
  });

  if (!article) {
    return { article: null, message: "Article not found" };
  }

  return {
    article: {
      id: article.id,
      path: article.path,
      title: article.title,
      description: article.description ?? extractMarkdownDescription(article.markdown),
      tags: article.tags,
      markdown: article.markdown,
      authorName: article.author?.name ?? null,
      commentCount: article._count.comments,
      createdAt: article.createdAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
      publishedAt: article.publishedAt?.toISOString() ?? null,
    },
  };
}

async function listWikiTree() {
  const articles = await prisma.article.findMany({
    where: { status: ArticleStatus.PUBLISHED },
    select: {
      path: true,
      title: true,
      updatedAt: true,
    },
    orderBy: { path: "asc" },
  });

  return {
    totalCount: articles.length,
    articles: articles.map((a) => ({
      path: a.path,
      title: a.title,
      updatedAt: a.updatedAt.toISOString(),
    })),
  };
}

async function listRecentArticles({ limit }: z.infer<typeof listRecentSchema>) {
  const articles = await prisma.article.findMany({
    where: { status: ArticleStatus.PUBLISHED },
    select: {
      path: true,
      title: true,
      description: true,
      tags: true,
      updatedAt: true,
      publishedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { path: "asc" }],
    take: limit,
  });

  return {
    totalCount: articles.length,
    articles: articles.map((a) => ({
      path: a.path,
      title: a.title,
      description: a.description,
      tags: a.tags,
      updatedAt: a.updatedAt.toISOString(),
      publishedAt: a.publishedAt?.toISOString() ?? null,
    })),
  };
}

async function getRelatedArticles({
  path,
  limit,
}: z.infer<typeof getRelatedSchema>) {
  const article = await prisma.article.findFirst({
    where: { path, status: ArticleStatus.PUBLISHED },
    select: { path: true, title: true, tags: true },
  });

  if (!article) {
    return { totalCount: 0, articles: [] };
  }

  const topLevel = article.path.split("/").filter(Boolean)[0] ?? article.path;

  const related = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      path: { not: article.path },
      OR: [
        article.tags.length > 0 ? { tags: { hasSome: article.tags } } : undefined,
        topLevel
          ? {
              OR: [
                { path: topLevel },
                { path: { startsWith: `${topLevel}/` } },
              ],
            }
          : undefined,
      ].filter(Boolean) as object[],
    },
    select: {
      path: true,
      title: true,
      description: true,
      tags: true,
      updatedAt: true,
      publishedAt: true,
    },
    orderBy: [{ updatedAt: "desc" }, { path: "asc" }],
    take: limit * 2,
  });

  // 简单去重
  const seen = new Set<string>();
  const deduped = related.filter((a) => {
    if (seen.has(a.path)) return false;
    seen.add(a.path);
    return true;
  }).slice(0, limit);

  return {
    totalCount: deduped.length,
    articles: deduped.map((a) => ({
      path: a.path,
      title: a.title,
      description: a.description,
      tags: a.tags,
      updatedAt: a.updatedAt.toISOString(),
      publishedAt: a.publishedAt?.toISOString() ?? null,
    })),
  };
}

async function listCategories() {
  const articles = await prisma.article.findMany({
    where: { status: ArticleStatus.PUBLISHED },
    select: { path: true, title: true },
    orderBy: { path: "asc" },
  });

  const categories = new Map<string, { count: number; samples: { path: string; title: string }[] }>();

  for (const article of articles) {
    const topLevel = article.path.split("/").filter(Boolean)[0] ?? "(root)";
    if (!categories.has(topLevel)) {
      categories.set(topLevel, { count: 0, samples: [] });
    }
    const cat = categories.get(topLevel)!;
    cat.count += 1;
    if (cat.samples.length < 3) {
      cat.samples.push({ path: article.path, title: article.title });
    }
  }

  const result = Array.from(categories.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, data]) => ({
      name,
      articleCount: data.count,
      sampleArticles: data.samples,
    }));

  return {
    totalCategories: result.length,
    totalArticles: articles.length,
    categories: result,
  };
}
