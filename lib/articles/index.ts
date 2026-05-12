import { ArticleStatus, CommentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export async function listPublishedArticleTreeData() {
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
