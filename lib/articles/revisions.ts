import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const ARTICLE_REVISIONS_PAGE_SIZE = 20;
export const ARTICLE_REVISIONS_MAX_PAGE_SIZE = 100;

export const revisionAuthorSelect = {
  id: true,
  name: true,
  email: true,
} as const;

export type RevisionArticleSnapshot = {
  id: string;
  title: string;
  markdown: string;
};

/**
 * Writes the article's current content as a new revision inside the caller's
 * transaction. Saving metadata-only changes does not create a duplicate
 * revision unless `force` is set (used when creating an article).
 */
export async function snapshotArticleRevision(
  tx: Prisma.TransactionClient,
  article: RevisionArticleSnapshot,
  authorId: string,
  options?: { force?: boolean },
) {
  const latest = await tx.articleRevision.findFirst({
    where: { articleId: article.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      title: true,
      markdown: true,
    },
  });

  if (
    !options?.force &&
    latest &&
    latest.title === article.title &&
    latest.markdown === article.markdown
  ) {
    return null;
  }

  return tx.articleRevision.create({
    data: {
      articleId: article.id,
      title: article.title,
      markdown: article.markdown,
      authorId,
    },
  });
}

export async function listArticleRevisions(
  articleId: string,
  options?: { page?: number; pageSize?: number },
) {
  const requestedPage = Math.max(1, Math.floor(options?.page ?? 1) || 1);
  const pageSize = Math.min(
    ARTICLE_REVISIONS_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(options?.pageSize ?? ARTICLE_REVISIONS_PAGE_SIZE) || 1),
  );

  const totalCount = await prisma.articleRevision.count({
    where: { articleId },
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const revisions = await prisma.articleRevision.findMany({
    where: { articleId },
    include: {
      author: {
        select: revisionAuthorSelect,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    revisions,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export async function getArticleRevisionDetail(
  articleId: string,
  revisionId: string,
) {
  const revision = await prisma.articleRevision.findFirst({
    where: {
      id: revisionId,
      articleId,
    },
    include: {
      author: {
        select: revisionAuthorSelect,
      },
    },
  });

  if (!revision) {
    return null;
  }

  const [previous, next, totalCount, olderCount] = await Promise.all([
    prisma.articleRevision.findFirst({
      where: {
        articleId,
        OR: [
          { createdAt: { lt: revision.createdAt } },
          { createdAt: revision.createdAt, id: { lt: revision.id } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
    prisma.articleRevision.findFirst({
      where: {
        articleId,
        OR: [
          { createdAt: { gt: revision.createdAt } },
          { createdAt: revision.createdAt, id: { gt: revision.id } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        createdAt: true,
      },
    }),
    prisma.articleRevision.count({
      where: { articleId },
    }),
    prisma.articleRevision.count({
      where: {
        articleId,
        OR: [
          { createdAt: { lt: revision.createdAt } },
          { createdAt: revision.createdAt, id: { lt: revision.id } },
        ],
      },
    }),
  ]);

  return {
    revision,
    previous,
    next,
    totalCount,
    version: olderCount + 1,
  };
}
