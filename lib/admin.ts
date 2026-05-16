import { cache } from "react";
import { ArticleStatus, CommentStatus, LogAction, Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

type ArticleTaxonomySource = {
  id: string;
  path: string;
  title: string;
  status: ArticleStatus;
  tags: string[];
  updatedAt: Date;
  author: {
    name: string;
  };
  _count: {
    comments: number;
  };
};

export type AdminSectionSummary = {
  slug: string;
  label: string;
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  totalComments: number;
  latestUpdatedAt: Date;
  sampleTitles: string[];
};

export type AdminTagSummary = {
  tag: string;
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  totalComments: number;
  latestUpdatedAt: Date;
  sampleTitles: string[];
};

export const listAdminTaxonomy = cache(async () => {
  const articles = await prisma.article.findMany({
    select: {
      id: true,
      path: true,
      title: true,
      status: true,
      tags: true,
      updatedAt: true,
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
    orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
  });

  return {
    sections: buildSectionSummaries(articles),
    tags: buildTagSummaries(articles),
  };
});

export const getAdminDashboardData = cache(async () => {
  const [articles, commentStats, pendingComments, userStats] = await Promise.all([
    prisma.article.findMany({
      select: {
        id: true,
        path: true,
        title: true,
        status: true,
        tags: true,
        updatedAt: true,
        publishedAt: true,
        createdAt: true,
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
      orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
    }),
    prisma.comment.groupBy({
      by: ["status"],
      _count: {
        _all: true,
      },
    }),
    prisma.comment.findMany({
      where: {
        status: CommentStatus.PENDING,
      },
      include: {
        article: {
          select: {
            title: true,
            path: true,
          },
        },
        author: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 5,
    }),
    Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: {
          role: Role.ROOT,
        },
      }),
      prisma.user.count({
        where: {
          role: Role.AUTHOR,
        },
      }),
      prisma.user.count({
        where: {
          emailVerified: true,
        },
      }),
    ]),
  ]);

  const { sections, tags } = {
    sections: buildSectionSummaries(articles),
    tags: buildTagSummaries(articles),
  };

  const publishedArticles = articles.filter(
    (article) => article.status === ArticleStatus.PUBLISHED,
  ).length;
  const draftArticles = articles.length - publishedArticles;
  const countsByCommentStatus = commentStats.reduce<Record<CommentStatus, number>>(
    (result, row) => {
      result[row.status] = row._count._all;
      return result;
    },
    {
      [CommentStatus.PENDING]: 0,
      [CommentStatus.APPROVED]: 0,
      [CommentStatus.REJECTED]: 0,
    },
  );

  return {
    totals: {
      articles: articles.length,
      publishedArticles,
      draftArticles,
      pendingComments: countsByCommentStatus[CommentStatus.PENDING],
      approvedComments: countsByCommentStatus[CommentStatus.APPROVED],
      rejectedComments: countsByCommentStatus[CommentStatus.REJECTED],
      tags: tags.length,
      sections: sections.length,
      users: userStats[0],
      rootUsers: userStats[1],
      authorUsers: userStats[2],
      verifiedUsers: userStats[3],
    },
    recentArticles: articles.slice(0, 6),
    pendingComments,
    sections: sections.slice(0, 6),
    tags: tags.slice(0, 8),
  };
});

export const listAdminUsers = cache(async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      emailVerified: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          articles: true,
          comments: true,
          approvedComments: true,
        },
      },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  return users.toSorted(
    (left, right) =>
      right._count.articles - left._count.articles ||
      right._count.comments - left._count.comments ||
      left.createdAt.getTime() - right.createdAt.getTime(),
  );
});

export const listAdminLogs = cache(
  async (options?: {
    page?: number;
    pageSize?: number;
    action?: LogAction;
    userId?: string;
  }) => {
    const page = options?.page ?? 1;
    const pageSize = options?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (options?.action) where.action = options.action;
    if (options?.userId?.trim()) where.userId = options.userId.trim();

    const [logs, totalCount] = await Promise.all([
      prisma.log.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.log.count({ where }),
    ]);

    return {
      logs,
      totalCount,
      page,
      pageSize,
      totalPages: Math.ceil(totalCount / pageSize),
    };
  },
);

function buildSectionSummaries(articles: ArticleTaxonomySource[]) {
  const sectionMap = new Map<string, AdminSectionSummary>();

  for (const article of articles) {
    const sectionSlug = article.path.split("/")[0] ?? "";
    const sectionLabel = sectionSlug || "root";
    const existing = sectionMap.get(sectionSlug);

    if (existing) {
      existing.totalArticles += 1;
      existing.totalComments += article._count.comments;
      if (article.status === ArticleStatus.PUBLISHED) {
        existing.publishedArticles += 1;
      } else {
        existing.draftArticles += 1;
      }
      if (article.updatedAt > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = article.updatedAt;
      }
      if (existing.sampleTitles.length < 3) {
        existing.sampleTitles.push(article.title);
      }
      continue;
    }

    sectionMap.set(sectionSlug, {
      slug: sectionSlug,
      label: sectionLabel,
      totalArticles: 1,
      publishedArticles: article.status === ArticleStatus.PUBLISHED ? 1 : 0,
      draftArticles: article.status === ArticleStatus.DRAFT ? 1 : 0,
      totalComments: article._count.comments,
      latestUpdatedAt: article.updatedAt,
      sampleTitles: [article.title],
    });
  }

  return Array.from(sectionMap.values()).sort(
    (left, right) =>
      right.totalArticles - left.totalArticles ||
      right.latestUpdatedAt.getTime() - left.latestUpdatedAt.getTime() ||
      left.label.localeCompare(right.label),
  );
}

function buildTagSummaries(articles: ArticleTaxonomySource[]) {
  const tagMap = new Map<string, AdminTagSummary>();

  for (const article of articles) {
    for (const tag of article.tags) {
      const existing = tagMap.get(tag);

      if (existing) {
        existing.totalArticles += 1;
        existing.totalComments += article._count.comments;
        if (article.status === ArticleStatus.PUBLISHED) {
          existing.publishedArticles += 1;
        } else {
          existing.draftArticles += 1;
        }
        if (article.updatedAt > existing.latestUpdatedAt) {
          existing.latestUpdatedAt = article.updatedAt;
        }
        if (existing.sampleTitles.length < 3) {
          existing.sampleTitles.push(article.title);
        }
        continue;
      }

      tagMap.set(tag, {
        tag,
        totalArticles: 1,
        publishedArticles: article.status === ArticleStatus.PUBLISHED ? 1 : 0,
        draftArticles: article.status === ArticleStatus.DRAFT ? 1 : 0,
        totalComments: article._count.comments,
        latestUpdatedAt: article.updatedAt,
        sampleTitles: [article.title],
      });
    }
  }

  return Array.from(tagMap.values()).sort(
    (left, right) =>
      right.totalArticles - left.totalArticles ||
      right.latestUpdatedAt.getTime() - left.latestUpdatedAt.getTime() ||
      left.tag.localeCompare(right.tag),
  );
}
