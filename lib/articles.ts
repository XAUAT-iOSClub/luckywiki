import { cache } from "react";
import { ArticleStatus, CommentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export const listPublishedArticleTreeData = cache(async () => {
  return prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
    },
    select: {
      path: true,
      title: true,
    },
    orderBy: {
      path: "asc",
    },
  });
});

export const getPublishedArticleByPath = cache(async (path: string) => {
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
      comments: {
        where: {
          status: CommentStatus.APPROVED,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          author: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });
});

export async function listAdminArticles(options?: { page?: number; pageSize?: number }) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 10;
  const skip = (page - 1) * pageSize;

  const [articles, totalCount] = await Promise.all([
    prisma.article.findMany({
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
    prisma.article.count(),
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
