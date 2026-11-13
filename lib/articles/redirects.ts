import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  readWikiPathResolutionCache,
  resolveWikiPathDecision,
  writeWikiPathResolutionCache,
  type WikiPathResolution,
} from "@/lib/articles/redirect-decision";

export type { WikiPathResolution } from "@/lib/articles/redirect-decision";

/**
 * Reads the requested path (any status) plus its redirect row and applies the
 * shared resolution rules. Exported for API routes that need the raw decision
 * without the proxy cache.
 */
export async function lookupWikiPath(path: string) {
  const [article, redirect] = await Promise.all([
    prisma.article.findUnique({
      where: { path },
      select: { path: true, status: true },
    }),
    prisma.articleRedirect.findUnique({
      where: { oldPath: path },
      select: {
        article: {
          select: { path: true, status: true },
        },
      },
    }),
  ]);

  return resolveWikiPathDecision(path, {
    article,
    redirect: redirect?.article ?? null,
  });
}

/**
 * Resolves an old wiki path to its current location for the HTTP layer.
 * Never throws: a database outage must not take the whole wiki down.
 *
 * Only "no redirect" results are cached. Caching a redirect would make path
 * reuse wrong for up to the TTL (a newly created article at an old path could
 * still be redirected somewhere else), while a stale "none" only means the old
 * URL is not redirected for a few seconds after a move.
 */
export async function resolveWikiPath(path: string): Promise<WikiPathResolution> {
  const cached = readWikiPathResolutionCache(path);

  if (cached) {
    return cached;
  }

  try {
    const resolution = await lookupWikiPath(path);

    if (resolution.type === "none") {
      writeWikiPathResolutionCache(path, resolution);
    }

    return resolution;
  } catch (error) {
    console.error("[wiki-redirect] resolution failed, falling back to the page", error);
    return { type: "none" };
  }
}

/** Removes redirects that would shadow a path an article is about to occupy. */
export async function releasePathRedirects(
  tx: Prisma.TransactionClient,
  paths: string[],
) {
  const uniquePaths = Array.from(new Set(paths.filter(Boolean)));

  if (!uniquePaths.length) {
    return 0;
  }

  const result = await tx.articleRedirect.deleteMany({
    where: { oldPath: { in: uniquePaths } },
  });

  return result.count;
}

/**
 * Stores one redirect per moved path. Only `oldPath → articleId` is persisted:
 * the target is always the article's current path, so repeat moves never build
 * redirect chains.
 */
export async function recordPathRedirects(
  tx: Prisma.TransactionClient,
  moves: Array<{ oldPath: string; articleId: string }>,
  createdBy: string | null,
) {
  for (const move of moves) {
    await tx.articleRedirect.upsert({
      where: { oldPath: move.oldPath },
      create: {
        oldPath: move.oldPath,
        articleId: move.articleId,
        createdBy,
      },
      update: {
        articleId: move.articleId,
        createdBy,
      },
    });
  }

  return moves.length;
}
