import { prisma } from "@/lib/prisma";
import { extractMarkdownPlainText } from "@/lib/text";
import { Prisma } from "@/generated/prisma/client";
import { cache } from "react";

const SEARCH_PAGE_SIZE = 10;
const EXCERPT_WINDOW = 150;

export type SearchResult = {
  id: string;
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  score: number;
  excerpt: string | null;
  matchField: string;
  updatedAt: Date;
};

export type SearchResults = {
  results: SearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  query: string;
};

async function searchWithPgTrgm(
  query: string,
  page: number,
  pageSize: number,
): Promise<SearchResults> {
  const pattern = `%${query}%`;
  const offset = (page - 1) * pageSize;

  const result = await prisma.$queryRaw<
    Array<{
      id: string;
      path: string;
      title: string;
      description: string | null;
      tags: string[];
      markdown: string;
      updatedAt: Date;
      score: number;
      totalCount: number;
    }>
  >(
    Prisma.sql`
      WITH matched AS (
        SELECT
          a.id, a.path, a.title, a.description, a.tags, a.markdown,
          a.updated_at AS "updatedAt",
          GREATEST(
            similarity(a.title, ${query}),
            COALESCE(similarity(a.description, ${query}), 0),
            similarity(a.markdown, ${query})
          ) AS score
        FROM articles a
        WHERE a.status = 'PUBLISHED'
          AND (
            a.title ILIKE ${pattern}
            OR a.description ILIKE ${pattern}
            OR a.markdown ILIKE ${pattern}
            OR ${query} = ANY(a.tags)
          )
      ),
      counted AS (
        SELECT COUNT(*)::int AS "totalCount" FROM matched
      )
      SELECT m.*, c."totalCount"
      FROM matched m, counted c
      ORDER BY m.score DESC, m."updatedAt" DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `,
  );

  const totalCount = result[0]?.totalCount ?? 0;

  const articles = result.map((row) => ({
    ...row,
    excerpt: generateExcerpt(row.markdown, query),
    matchField: getMatchField(row.title, row.description, row.markdown, query),
  }));

  return {
    results: articles,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    query,
  };
}

async function searchWithFallback(
  query: string,
  page: number,
  pageSize: number,
): Promise<SearchResults> {
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
        { markdown: { contains: query, mode: "insensitive" } },
        { tags: { has: query } },
      ],
    },
    select: {
      id: true,
      path: true,
      title: true,
      description: true,
      tags: true,
      markdown: true,
      updatedAt: true,
    },
  });

  const scored = articles
    .map((article) => ({
      ...article,
      score: computeFallbackScore(article, query),
      matchField: getMatchField(
        article.title,
        article.description,
        article.markdown,
        query,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const totalCount = scored.length;
  const sliced = scored.slice((page - 1) * pageSize, page * pageSize);

  return {
    results: sliced.map((a) => ({
      ...a,
      excerpt: generateExcerpt(a.markdown, query),
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    query,
  };
}

function computeFallbackScore(
  article: {
    title: string;
    description: string | null;
    tags: string[];
    markdown: string;
  },
  query: string,
): number {
  const q = query.toLowerCase();
  let score = 0;

  if (article.title.toLowerCase().includes(q)) {
    score += 100;
    score += Math.max(0, 10 - article.title.length / 5);
  }

  if (article.tags.some((tag) => tag.toLowerCase() === q)) {
    score += 90;
  }

  if (article.description?.toLowerCase().includes(q)) {
    score += 70;
  }

  const plainText = extractMarkdownPlainText(article.markdown).toLowerCase();
  const occurrences = plainText.split(q).length - 1;
  if (occurrences > 0) {
    score += Math.min(50, 50 + occurrences * 5);
  }

  return score;
}

function getMatchField(
  title: string,
  description: string | null,
  markdown: string,
  query: string,
): string {
  const q = query.toLowerCase();
  if (title.toLowerCase().includes(q)) return "title";
  if (description?.toLowerCase().includes(q)) return "description";
  if (markdown.toLowerCase().includes(q)) return "content";
  return "tags";
}

function generateExcerpt(markdown: string, query: string): string | null {
  const plainText = extractMarkdownPlainText(markdown);
  if (!plainText) return null;

  const lowerText = plainText.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);

  if (matchIndex === -1) {
    return `${plainText.slice(0, EXCERPT_WINDOW).trimEnd()}...`;
  }

  const half = Math.floor(EXCERPT_WINDOW / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(plainText.length, matchIndex + query.length + half);

  if (start > 0) {
    while (start > 0 && !isExcerptBoundary(plainText[start])) {
      start--;
    }
  }

  if (end < plainText.length) {
    while (end < plainText.length && !isExcerptBoundary(plainText[end])) {
      end++;
    }
  }

  let excerpt = "";
  if (start > 0) excerpt += "...";
  excerpt += plainText.slice(start, end).trim();
  if (end < plainText.length) excerpt += "...";

  return excerpt;
}

function isExcerptBoundary(char: string): boolean {
  return /[\s，,。.！!？?；;：:、\n]/.test(char);
}

export async function searchArticles(options: {
  query: string;
  page?: number;
  pageSize?: number;
}): Promise<SearchResults> {
  const query = options.query.trim();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? SEARCH_PAGE_SIZE;

  if (!query) {
    return {
      results: [],
      totalCount: 0,
      page: 1,
      pageSize,
      totalPages: 0,
      query: "",
    };
  }

  const hasTrgm = await isPgTrgmAvailable();

  if (hasTrgm) {
    return searchWithPgTrgm(query, page, pageSize);
  }
  return searchWithFallback(query, page, pageSize);
}

const isPgTrgmAvailable = cache(async (): Promise<boolean> => {
  try {
    const result = await prisma.$queryRaw<Array<{ installed: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
      ) AS "installed"
    `;
    return result[0]?.installed ?? false;
  } catch {
    return false;
  }
});
