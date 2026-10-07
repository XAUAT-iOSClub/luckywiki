import { ArticleStatus, CommentStatus } from "@/generated/prisma/enums";
import { cacheLife, cacheTag } from "next/cache";
import {
  articleCacheTag,
  articleCommentsCacheTag,
  ARTICLES_CACHE_TAG,
} from "@/lib/cache-tags";
import { prisma } from "@/lib/prisma";

export const PUBLIC_COMMENTS_PAGE_SIZE = 20;

const publicArticleListSelect = {
  path: true,
  title: true,
  description: true,
  tags: true,
  publishedAt: true,
  updatedAt: true,
} as const;

export type PublishedArticleListItem = {
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  publishedAt: Date | null;
  updatedAt: Date;
};

export type PublishedSectionSummary = {
  slug: string;
  articleCount: number;
};

export type PublishedTagSummary = {
  tag: string;
  articleCount: number;
};

export async function listPublishedArticleTreeData() {
  "use cache";
  cacheLife("max");
  cacheTag(ARTICLES_CACHE_TAG);

  return prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
    },
    select: {
      path: true,
      title: true,
      publishedAt: true,
      updatedAt: true,
    },
    orderBy: {
      path: "asc",
    },
  });
}

export async function getPublishedArticleByPath(path: string) {
  "use cache";
  cacheLife("max");
  cacheTag(articleCacheTag(path));

  return prisma.article.findFirst({
    where: {
      path,
      status: ArticleStatus.PUBLISHED,
    },
    include: {
      author: {
        select: {
          name: true,
        },
      },
    },
  });
}

export async function listPublishedArticlesByTag(tag: string) {
  "use cache";
  cacheLife("max");
  cacheTag(ARTICLES_CACHE_TAG);

  return prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      tags: { has: tag },
    },
    select: publicArticleListSelect,
    orderBy: [{ updatedAt: "desc" }, { path: "asc" }],
  });
}

export async function listPublishedArticlesBySection(section: string) {
  "use cache";
  cacheLife("max");
  cacheTag(ARTICLES_CACHE_TAG);

  return prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      OR: [
        { path: section },
        { path: { startsWith: `${section}/` } },
      ],
    },
    select: publicArticleListSelect,
    orderBy: [{ updatedAt: "desc" }, { path: "asc" }],
  });
}

export async function listPublishedTaxonomy() {
  "use cache";
  cacheLife("max");
  cacheTag(ARTICLES_CACHE_TAG);

  const articles = await prisma.article.findMany({
    where: { status: ArticleStatus.PUBLISHED },
    select: {
      path: true,
      tags: true,
    },
  });

  const sections = new Map<string, number>();
  const tags = new Map<string, number>();

  for (const article of articles) {
    const section = article.path.split("/")[0] ?? "";
    sections.set(section, (sections.get(section) ?? 0) + 1);

    for (const tag of article.tags) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }

  return {
    sections: Array.from(sections, ([slug, articleCount]) => ({ slug, articleCount }))
      .filter((section) => section.slug)
      .sort((left, right) => right.articleCount - left.articleCount || left.slug.localeCompare(right.slug)),
    tags: Array.from(tags, ([tag, articleCount]) => ({ tag, articleCount }))
      .sort((left, right) => right.articleCount - left.articleCount || left.tag.localeCompare(right.tag)),
  } satisfies {
    sections: PublishedSectionSummary[];
    tags: PublishedTagSummary[];
  };
}

export async function listPublishedArticleComments(
  articleId: string,
  page = 1,
  pageSize = PUBLIC_COMMENTS_PAGE_SIZE,
) {
  "use cache";
  cacheLife("max");
  cacheTag(articleCommentsCacheTag(articleId));

  const requestedPage = Math.max(1, Math.floor(page) || 1);
  const normalizedPageSize = Math.min(
    100,
    Math.max(1, Math.floor(pageSize) || PUBLIC_COMMENTS_PAGE_SIZE),
  );
  const where = { articleId, status: CommentStatus.APPROVED };
  const totalCount = await prisma.comment.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const comments = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: "asc" },
    skip: (normalizedPage - 1) * normalizedPageSize,
    take: normalizedPageSize,
    include: {
      author: { select: { name: true } },
    },
  });

  return {
    comments,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    totalPages,
  };
}

export async function listAdminArticles(options?: {
  page?: number;
  pageSize?: number;
  query?: string;
  status?: ArticleStatus;
  tag?: string;
  section?: string;
}) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 10;
  const skip = (page - 1) * pageSize;
  const query = options?.query?.trim();
  const status = options?.status;
  const tag = options?.tag?.trim();
  const section = options?.section?.trim();
  const where = {
    ...(status ? { status } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(section
      ? {
          OR: [
            { path: section },
            { path: { startsWith: `${section}/` } },
          ],
        }
      : {}),
    ...(query
      ? {
          AND: [
            {
              OR: [
                { title: { contains: query, mode: "insensitive" as const } },
                { path: { contains: query, mode: "insensitive" as const } },
                { description: { contains: query, mode: "insensitive" as const } },
                { tags: { has: query } },
              ],
            },
          ],
        }
      : {}),
  };

  const [articles, totalCount] = await Promise.all([
    prisma.article.findMany({
      where,
      include: {
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
      orderBy: [{ updatedAt: "desc" }, { path: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.article.count({
      where,
    }),
  ]);

  return {
    articles,
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

export async function getArticleById(id: string) {
  return prisma.article.findUnique({
    where: { id },
  });
}
