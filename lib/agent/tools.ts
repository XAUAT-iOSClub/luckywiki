import { tool } from "langchain";
import { z } from "zod";
import { ArticleStatus } from "@/generated/prisma/enums";
import { buildArticleChunks } from "@/lib/agent/chunks";
import {
  findSuggestedAgentSources,
  retrieveRelevantAgentChunks,
} from "@/lib/agent/search";
import { prisma } from "@/lib/prisma";
import { extractMarkdownDescription } from "@/lib/text";
import type { AgentSource, RetrievedAgentChunk } from "@/types/agent";

type PublishedArticleRecord = {
  id: string;
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  markdown: string;
  updatedAt: Date;
  publishedAt: Date | null;
};

type ArticleSummary = {
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  updatedAt: string;
  publishedAt: string | null;
};

type CategorySummary = {
  name: string;
  count: number;
  sampleArticles: Pick<ArticleSummary, "path" | "title">[];
};

export type WikiAgentToolDeps = {
  retrieveRelevantChunks: (query: string) => Promise<RetrievedAgentChunk[]>;
  findSuggestedSources: (query: string) => Promise<AgentSource[]>;
  findArticleByPath: (path: string) => Promise<PublishedArticleRecord | null>;
  findArticlesByPath: (query: string, limit: number) => Promise<ArticleSummary[]>;
  listRecentArticles: (limit: number) => Promise<ArticleSummary[]>;
  listAllPublishedArticles: () => Promise<ArticleSummary[]>;
  listRelatedArticles: (path: string, limit: number) => Promise<ArticleSummary[]>;
};

const defaultSearchLimit = 5;
const defaultRecentLimit = 5;
const defaultRelatedLimit = 4;
const defaultCategoryLimit = 8;

const defaultWikiAgentToolDeps: WikiAgentToolDeps = {
  retrieveRelevantChunks: retrieveRelevantAgentChunks,
  findSuggestedSources: findSuggestedAgentSources,
  async findArticleByPath(path) {
    return prisma.article.findFirst({
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
        updatedAt: true,
        publishedAt: true,
      },
    });
  },
  async findArticlesByPath(query, limit) {
    const normalized = query.trim();

    if (!normalized) {
      return [];
    }

    const articles = await prisma.article.findMany({
      where: {
        status: ArticleStatus.PUBLISHED,
        OR: [
          { path: { contains: normalized, mode: "insensitive" } },
          { title: { contains: normalized, mode: "insensitive" } },
          { description: { contains: normalized, mode: "insensitive" } },
          { tags: { has: normalized } },
        ],
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
      take: limit,
    });

    return articles.map(toArticleSummary);
  },
  async listRecentArticles(limit) {
    const articles = await prisma.article.findMany({
      where: {
        status: ArticleStatus.PUBLISHED,
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
      take: limit,
    });

    return articles.map(toArticleSummary);
  },
  async listAllPublishedArticles() {
    const articles = await prisma.article.findMany({
      where: {
        status: ArticleStatus.PUBLISHED,
      },
      select: {
        path: true,
        title: true,
        description: true,
        tags: true,
        updatedAt: true,
        publishedAt: true,
      },
      orderBy: {
        path: "asc",
      },
    });

    return articles.map(toArticleSummary);
  },
  async listRelatedArticles(path, limit) {
    const article = await prisma.article.findFirst({
      where: {
        path,
        status: ArticleStatus.PUBLISHED,
      },
      select: {
        path: true,
        title: true,
        tags: true,
      },
    });

    if (!article) {
      return [];
    }

    const topLevel = article.path.split("/").filter(Boolean)[0] ?? article.path;
    const related = await prisma.article.findMany({
      where: {
        status: ArticleStatus.PUBLISHED,
        path: {
          not: article.path,
        },
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

    return dedupeArticleSummaries(related.map(toArticleSummary)).slice(0, limit);
  },
};

export async function searchWikiKnowledge(
  query: string,
  deps: WikiAgentToolDeps = defaultWikiAgentToolDeps,
) {
  const normalized = query.trim();

  if (!normalized) {
    return {
      query: normalized,
      mode: "empty",
      sources: [],
      chunks: [],
    };
  }

  const chunks = await deps.retrieveRelevantChunks(normalized);

  if (chunks.length > 0) {
    return {
      query: normalized,
      mode: "semantic",
      sources: dedupeSources(chunks),
      chunks: chunks.map((chunk) => ({
        title: chunk.title,
        path: chunk.path,
        heading: chunk.heading,
        content: chunk.content,
        score: roundScore(chunk.score),
      })),
    };
  }

  const suggestions = await deps.findSuggestedSources(normalized);

  return {
    query: normalized,
    mode: "suggestions",
    sources: suggestions,
    chunks: [],
  };
}

export async function getWikiArticleDetails(
  path: string,
  deps: WikiAgentToolDeps = defaultWikiAgentToolDeps,
) {
  const article = await deps.findArticleByPath(path.trim());

  if (!article) {
    return {
      found: false,
      path: path.trim(),
    };
  }

  const chunks = buildArticleChunks({
    id: article.id,
    title: article.title,
    path: article.path,
    markdown: article.markdown,
    status: ArticleStatus.PUBLISHED,
  });

  return {
    found: true,
    article: {
      path: article.path,
      title: article.title,
      description: article.description ?? extractMarkdownDescription(article.markdown, 220),
      tags: article.tags,
      updatedAt: article.updatedAt.toISOString(),
      publishedAt: article.publishedAt?.toISOString() ?? null,
      chunks: chunks.slice(0, 4).map((chunk) => ({
        heading: chunk.heading,
        content: chunk.content,
      })),
    },
  };
}

export async function searchWikiPaths(
  query: string,
  limit = defaultSearchLimit,
  deps: WikiAgentToolDeps = defaultWikiAgentToolDeps,
) {
  return {
    query: query.trim(),
    matches: await deps.findArticlesByPath(query, limit),
  };
}

export async function getRecentWikiArticles(
  limit = defaultRecentLimit,
  deps: WikiAgentToolDeps = defaultWikiAgentToolDeps,
) {
  return {
    articles: await deps.listRecentArticles(limit),
  };
}

export async function getRelatedWikiArticles(
  path: string,
  limit = defaultRelatedLimit,
  deps: WikiAgentToolDeps = defaultWikiAgentToolDeps,
) {
  const exactArticle = await deps.findArticleByPath(path.trim());

  if (!exactArticle) {
    return {
      found: false,
      path: path.trim(),
      articles: [],
    };
  }

  const related = await deps.listRelatedArticles(exactArticle.path, limit);
  const semanticSuggestions = await deps.findSuggestedSources(exactArticle.title);
  const fallbackArticles = await deps.findArticlesByPath(exactArticle.title, limit);

  const articles = dedupeArticleSummaries([
    ...related,
    ...fallbackArticles,
    ...semanticSuggestions.map((source) => ({
      path: source.path,
      title: source.title,
      description: null,
      tags: [],
      updatedAt: "",
      publishedAt: null,
    })),
  ])
    .filter((article) => article.path !== exactArticle.path)
    .slice(0, limit);

  return {
    found: true,
    path: exactArticle.path,
    title: exactArticle.title,
    articles,
  };
}

export async function listWikiCategories(
  limit = defaultCategoryLimit,
  deps: WikiAgentToolDeps = defaultWikiAgentToolDeps,
) {
  const articles = await deps.listAllPublishedArticles();
  const categories = new Map<string, CategorySummary>();

  for (const article of articles) {
    const name = article.path.split("/").filter(Boolean)[0] ?? article.path;

    if (!name) {
      continue;
    }

    const current = categories.get(name) ?? {
      name,
      count: 0,
      sampleArticles: [],
    };

    current.count += 1;

    if (current.sampleArticles.length < 3) {
      current.sampleArticles.push({
        path: article.path,
        title: article.title,
      });
    }

    categories.set(name, current);
  }

  return {
    categories: Array.from(categories.values())
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
      .slice(0, limit),
  };
}

export function createWikiAgentTools(deps: WikiAgentToolDeps = defaultWikiAgentToolDeps) {
  return [
    tool(
      async ({ query }) => JSON.stringify(await searchWikiKnowledge(query, deps)),
      {
        name: "search_wiki_knowledge",
        description:
          "Run semantic search over published LuckyWiki content and return relevant article chunks.",
        schema: z.object({
          query: z.string().trim().min(1).describe("The user's wiki question or topic."),
        }),
      },
    ),
    tool(
      async ({ path }) => JSON.stringify(await getWikiArticleDetails(path, deps)),
      {
        name: "get_wiki_article_details",
        description:
          "Fetch a published LuckyWiki article by its exact path and return metadata plus key content chunks.",
        schema: z.object({
          path: z.string().trim().min(1).describe("The exact wiki article path."),
        }),
      },
    ),
    tool(
      async ({ query, limit }) =>
        JSON.stringify(await searchWikiPaths(query, limit ?? defaultSearchLimit, deps)),
      {
        name: "search_wiki_paths",
        description:
          "Search published LuckyWiki articles by path, title, description, or tag for navigation-style queries.",
        schema: z.object({
          query: z.string().trim().min(1).describe("The path fragment, title, or keyword to search."),
          limit: z.number().int().min(1).max(10).optional().describe("Maximum number of matches."),
        }),
      },
    ),
    tool(
      async ({ limit }) => JSON.stringify(await getRecentWikiArticles(limit ?? defaultRecentLimit, deps)),
      {
        name: "list_recent_wiki_articles",
        description: "List recently updated published LuckyWiki articles.",
        schema: z.object({
          limit: z.number().int().min(1).max(10).optional().describe("Maximum number of articles."),
        }),
      },
    ),
    tool(
      async ({ path, limit }) =>
        JSON.stringify(await getRelatedWikiArticles(path, limit ?? defaultRelatedLimit, deps)),
      {
        name: "get_related_wiki_articles",
        description:
          "Find published LuckyWiki articles related to a given article path by tags, section, and title.",
        schema: z.object({
          path: z.string().trim().min(1).describe("The exact article path to expand from."),
          limit: z.number().int().min(1).max(10).optional().describe("Maximum number of related articles."),
        }),
      },
    ),
    tool(
      async ({ limit }) => JSON.stringify(await listWikiCategories(limit ?? defaultCategoryLimit, deps)),
      {
        name: "list_wiki_categories",
        description:
          "List the main LuckyWiki path categories with article counts and sample articles.",
        schema: z.object({
          limit: z.number().int().min(1).max(20).optional().describe("Maximum number of categories."),
        }),
      },
    ),
  ];
}

function toArticleSummary(article: {
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  updatedAt: Date;
  publishedAt: Date | null;
}): ArticleSummary {
  return {
    path: article.path,
    title: article.title,
    description: article.description,
    tags: article.tags,
    updatedAt: article.updatedAt.toISOString(),
    publishedAt: article.publishedAt?.toISOString() ?? null,
  };
}

function dedupeSources(sources: Array<Pick<AgentSource, "path" | "title">>) {
  return Array.from(
    new Map(sources.map((source) => [source.path, { path: source.path, title: source.title }])).values(),
  );
}

function dedupeArticleSummaries<T extends { path: string }>(articles: T[]) {
  return Array.from(new Map(articles.map((article) => [article.path, article])).values());
}

function roundScore(score: number) {
  return Math.round(score * 1000) / 1000;
}
