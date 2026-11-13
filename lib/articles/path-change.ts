import type { Prisma } from "@/generated/prisma/client";
import { ArticleStatus, LogAction } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { planArticlePathMove } from "@/lib/articles/move";
import {
  buildLinkRewritePatterns,
  planLinkRewrite,
  type LinkRewritePlan,
} from "@/lib/articles/link-rewrite";
import {
  MAX_LINK_REWRITE_ARTICLES,
  MAX_SYNC_PATH_MOVE,
  validatePathChangeTarget,
  type PathChangeStatus,
} from "@/lib/articles/path-rules";
import {
  clearWikiPathResolutionCache,
} from "@/lib/articles/redirect-decision";
import { recordPathRedirects, releasePathRedirects } from "@/lib/articles/redirects";
import { snapshotArticleRevision } from "@/lib/articles/revisions";
import { syncArticleMediaReferences } from "@/lib/media/references";
import { enqueueArticleEmbeddingSync } from "@/lib/embedding-queue";
import { dispatchWebhookEventAfterResponse, WEBHOOK_EVENTS } from "@/lib/webhook/delivery";
import type { WebhookActor } from "@/lib/webhook/types";
import { getSiteUrl } from "@/lib/site";

export type PathChangeSource =
  | "editor"
  | "article-page"
  | "rest-api"
  | "folder-rename";

/** A single page move or a folder (path prefix) move. */
export type PathChangeTarget =
  | { kind: "article"; articleId: string }
  | { kind: "folder"; path: string };

/** Fields the editor / REST PUT send together with the new path. */
export type PathChangeArticleData = {
  title?: string;
  description?: string | null;
  tags?: string[];
  editor?: string | null;
  markdown?: string;
  status?: ArticleStatus;
  publishedAt?: Date | null;
};

export type PathChangePreview = {
  status: PathChangeStatus;
  currentPath: string;
  nextPath: string;
  movedCount: number;
  publishedCount: number;
  draftCount: number;
  archivedCount: number;
  redirectCount: number;
  linkArticleCount: number;
  linkCount: number;
  conflictPath: string | null;
};

export type PathChangeMovedArticle = {
  id: string;
  oldPath: string;
  newPath: string;
  title: string;
  status: ArticleStatus;
  updatedAt: Date;
};

export type PathChangeSuccess = {
  status: "ok";
  targetKind: PathChangeTarget["kind"];
  primaryArticleId: string | null;
  primaryArticle: { id: string; path: string; title: string; status: ArticleStatus } | null;
  currentPath: string;
  nextPath: string;
  moves: PathChangeMovedArticle[];
  redirectsCreated: number;
  linkRewriteArticleCount: number;
  linkRewriteCount: number;
  rewrittenArticles: Array<{
    id: string;
    path: string;
    title: string;
    status: ArticleStatus;
    updatedAt: Date;
  }>;
};

export type PathChangeFailure = {
  status: Exclude<PathChangeStatus, "ok">;
  currentPath: string;
  nextPath: string;
  conflictPath: string | null;
};

export type PathChangeResult = PathChangeSuccess | PathChangeFailure;

export type {
  PathChangeStatus,
} from "@/lib/articles/path-rules";

type PlanArticle = {
  id: string;
  path: string;
  title: string;
  status: ArticleStatus;
};

type PathChangePlan = {
  status: "ok";
  targetKind: PathChangeTarget["kind"];
  sourcePath: string;
  nextPath: string;
  moves: Array<PlanArticle & { oldPath: string; newPath: string }>;
  primary: PlanArticle | null;
};

type ReadClient = Pick<Prisma.TransactionClient, "article" | "articleRedirect">;

/**
 * Single source of truth for planning a path change. Both preview and apply
 * call this, so what the user confirms is exactly what gets executed.
 */
async function buildPathChangePlan(
  client: ReadClient,
  target: PathChangeTarget,
  nextPathInput: string,
): Promise<PathChangePlan | PathChangeFailure> {
  let primary: PlanArticle | null = null;
  let sourcePath: string;

  if (target.kind === "article") {
    const article = await client.article.findUnique({
      where: { id: target.articleId },
      select: { id: true, path: true, title: true, status: true },
    });

    if (!article) {
      return {
        status: "not-found",
        currentPath: "",
        nextPath: nextPathInput.trim(),
        conflictPath: null,
      };
    }

    primary = article;
    sourcePath = article.path;
  } else {
    sourcePath = target.path;
  }

  const validation = validatePathChangeTarget(sourcePath, nextPathInput);

  if (validation.status === "ok") {
    const nextPath = validation.nextPath;
    const [sourceRows, targetRows] = await Promise.all([
      client.article.findMany({
        where: {
          OR: [
            { path: sourcePath },
            { path: { startsWith: `${sourcePath}/` } },
          ],
        },
        select: { id: true, path: true, title: true, status: true },
        orderBy: { path: "asc" },
      }),
      client.article.findMany({
        where: {
          OR: [
            { path: nextPath },
            { path: { startsWith: `${nextPath}/` } },
          ],
        },
        select: { path: true },
      }),
    ]);

    const plan = planArticlePathMove(
      Array.from(new Set([...sourceRows.map((row) => row.path), ...targetRows.map((row) => row.path)])),
      sourcePath,
      nextPath,
      { requireSourceArticle: target.kind === "article" },
    );

    if (plan.status === "conflict") {
      return {
        status: "conflict",
        currentPath: sourcePath,
        nextPath,
        conflictPath: plan.path,
      };
    }

    if (plan.status !== "ok") {
      return {
        status: plan.status === "same" ? "same" : plan.status,
        currentPath: sourcePath,
        nextPath,
        conflictPath: null,
      };
    }

    if (plan.moves.length > MAX_SYNC_PATH_MOVE) {
      return {
        status: "too-many",
        currentPath: sourcePath,
        nextPath,
        conflictPath: null,
      };
    }

    const rowsByPath = new Map(sourceRows.map((row) => [row.path, row]));
    const moves = plan.moves.map((move) => {
      const row = rowsByPath.get(move.from);

      if (!row) {
        throw new Error(`Missing source article for path "${move.from}".`);
      }

      return {
        ...row,
        oldPath: move.from,
        newPath: move.to,
      };
    });

    return {
      status: "ok",
      targetKind: target.kind,
      sourcePath,
      nextPath,
      moves,
      primary: primary ?? sourceRows.find((row) => row.path === sourcePath) ?? null,
    };
  }

  return {
    status: validation.status,
    currentPath: sourcePath,
    nextPath: nextPathInput.trim(),
    conflictPath: null,
  };
}

/** Read-only preview used by the editor, the move dialog and folder rename. */
export async function previewPathChange(
  target: PathChangeTarget,
  nextPathInput: string,
  options?: { rewriteLinks?: boolean },
): Promise<PathChangePreview> {
  const plan = await buildPathChangePlan(prisma, target, nextPathInput);

  if (plan.status !== "ok") {
    return {
      ...plan,
      movedCount: 0,
      publishedCount: 0,
      draftCount: 0,
      archivedCount: 0,
      redirectCount: 0,
      linkArticleCount: 0,
      linkCount: 0,
    };
  }

  const counts = countMoves(plan.moves);
  const linkPlan =
    options?.rewriteLinks === false
      ? emptyLinkPlan()
      : await previewLinkRewrite(prisma, plan.sourcePath, plan.nextPath);

  return {
    status: "ok",
    currentPath: plan.sourcePath,
    nextPath: plan.nextPath,
    ...counts,
    redirectCount: plan.moves.length,
    linkArticleCount: linkPlan.articleCount,
    linkCount: linkPlan.linkCount,
    conflictPath: null,
  };
}

/**
 * Applies the move atomically: every path update, redirect row and audit log
 * lands in one transaction, so a failure can never leave a half-moved tree.
 */
export async function applyPathChange(params: {
  target: PathChangeTarget;
  nextPathInput: string;
  actorId: string;
  source: PathChangeSource;
  rewriteLinks?: boolean;
  primaryData?: PathChangeArticleData;
}): Promise<PathChangeResult> {
  const result = await prisma.$transaction(async (tx) => {
    const plan = await buildPathChangePlan(tx, params.target, params.nextPathInput);

    if (plan.status !== "ok") {
      return plan;
    }

    const updatedRows: Array<PlanArticle & { markdown: string; updatedAt: Date }> = [];
    const rules = [{ from: plan.sourcePath, to: plan.nextPath }];

    for (const move of plan.moves) {
      const isPrimary = plan.primary?.id === move.id;
      const data =
        isPrimary && params.primaryData
          ? { ...toArticleUpdateData(params.primaryData), path: move.newPath }
          : { path: move.newPath };

      const updated = await tx.article.update({
        where: { id: move.id },
        data,
        select: {
          id: true,
          path: true,
          title: true,
          status: true,
          markdown: true,
          updatedAt: true,
        },
      });

      updatedRows.push(updated);

      if (isPrimary && params.primaryData) {
        await snapshotArticleRevision(tx, updated, params.actorId);
        await syncArticleMediaReferences(tx, updated.id, updated.markdown);
      }
    }

    // Path reuse wins over history: a redirect must never shadow a path that
    // now hosts an article (including the paths we just moved onto).
    await releasePathRedirects(
      tx,
      plan.moves.map((move) => move.newPath),
    );

    const redirectsCreated = await recordPathRedirects(
      tx,
      plan.moves.map((move) => ({ oldPath: move.oldPath, articleId: move.id })),
      params.actorId,
    );

    const linkPlan =
      params.rewriteLinks === false
        ? { plan: emptyLinkPlan(), rewrittenArticles: [] }
        : await rewriteLinksInArticles(tx, rules, {
            actorId: params.actorId,
            source: params.source,
          });

    const counts = countMoves(plan.moves);
    const primaryArticleId = plan.primary?.id ?? plan.moves[0]?.id ?? null;
    const updatedById = new Map(updatedRows.map((row) => [row.id, row]));
    const primaryUpdated = plan.primary ? updatedById.get(plan.primary.id) : undefined;
    const primaryMove = plan.primary
      ? plan.moves.find((move) => move.id === plan.primary?.id)
      : undefined;
    const primaryArticle = plan.primary
      ? {
          id: plan.primary.id,
          path: primaryUpdated?.path ?? primaryMove?.newPath ?? plan.primary.path,
          title: primaryUpdated?.title ?? plan.primary.title,
          status: primaryUpdated?.status ?? plan.primary.status,
        }
      : null;

    await tx.log.create({
      data: {
        action:
          plan.targetKind === "folder"
            ? LogAction.RENAME_FOLDER
            : LogAction.MOVE_ARTICLE,
        targetType:
          plan.targetKind === "folder" && !plan.primary ? "Folder" : "Article",
        targetId:
          plan.targetKind === "folder" && !plan.primary
            ? plan.nextPath
            : (primaryArticleId ?? plan.nextPath),
        detail: JSON.stringify({
          title: plan.primary?.title ?? plan.sourcePath,
          path: plan.nextPath,
          oldPath: plan.sourcePath,
          newPath: plan.nextPath,
          ...counts,
          redirectsCreated,
          linkRewriteArticleCount: linkPlan.plan.articleCount,
          linkRewriteCount: linkPlan.plan.linkCount,
          source: params.source,
          ...(plan.targetKind === "folder" ? { folderPath: plan.sourcePath } : {}),
        }),
        userId: params.actorId,
      },
    });

    return {
      status: "ok" as const,
      targetKind: plan.targetKind,
      primaryArticleId,
      primaryArticle,
      currentPath: plan.sourcePath,
      nextPath: plan.nextPath,
      moves: plan.moves.map((move) => {
        const updated = updatedById.get(move.id);

        return {
          id: move.id,
          oldPath: move.oldPath,
          newPath: updated?.path ?? move.newPath,
          title: updated?.title ?? move.title,
          status: updated?.status ?? move.status,
          updatedAt: updated?.updatedAt ?? new Date(),
        };
      }),
      redirectsCreated,
      linkRewriteArticleCount: linkPlan.plan.articleCount,
      linkRewriteCount: linkPlan.plan.linkCount,
      rewrittenArticles: linkPlan.rewrittenArticles,
    };
  });

  if (result.status === "ok") {
    // Best effort for the current process; other workers pick it up after TTL.
    clearWikiPathResolutionCache();
  }

  return result;
}

/** Paths whose caches must be invalidated after a successful change. */
export function getPathChangeCacheInput(result: PathChangeSuccess) {
  return {
    oldPaths: result.moves.map((move) => move.oldPath),
    newPaths: result.moves.map((move) => move.newPath),
    articleIds: result.moves.map((move) => move.id),
  };
}

/**
 * Post-commit work shared by every entry point: re-index the moved pages (and
 * any page whose links were rewritten) and notify webhook subscribers. Runs
 * after the transaction committed, so a queue/webhook failure can never roll
 * back a successful move.
 */
export async function publishPathChangeSideEffects(
  result: PathChangeSuccess,
  actor: WebhookActor | null,
) {
  const indexTargets = [
    ...result.moves.map((move) => ({ id: move.id, updatedAt: move.updatedAt })),
    ...result.rewrittenArticles.map((article) => ({
      id: article.id,
      updatedAt: article.updatedAt,
    })),
  ];
  const seen = new Set<string>();

  for (const target of indexTargets) {
    if (seen.has(target.id)) {
      continue;
    }

    seen.add(target.id);

    try {
      await enqueueArticleEmbeddingSync({
        articleId: target.id,
        updatedAt: target.updatedAt.toISOString(),
      });
    } catch (error) {
      console.error("[path-change] failed to enqueue embedding sync", error);
    }
  }

  const primary =
    result.primaryArticle ??
    (result.moves[0]
      ? {
          id: result.moves[0].id,
          path: result.moves[0].newPath,
          title: result.moves[0].title,
          status: result.moves[0].status,
        }
      : null);

  if (primary) {
    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_MOVED,
      {
        id: primary.id,
        path: primary.path,
        title: primary.title,
        status: primary.status,
      },
      actor,
      {
        oldPath: result.currentPath,
        newPath: result.nextPath,
        movedCount: result.moves.length,
        redirectsCreated: result.redirectsCreated,
        linkRewriteCount: result.linkRewriteCount,
        items: result.moves.map((move) => ({
          id: move.id,
          oldPath: move.oldPath,
          newPath: move.newPath,
        })),
      },
    );

    // Keep existing subscribers working: every moved page is still an update.
    for (const move of result.moves) {
      dispatchWebhookEventAfterResponse(
        WEBHOOK_EVENTS.ARTICLE_UPDATED,
        {
          id: move.id,
          path: move.newPath,
          title: move.title,
          status: move.status,
        },
        actor,
      );
    }
  }

  for (const article of result.rewrittenArticles) {
    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_UPDATED,
      {
        id: article.id,
        path: article.path,
        title: article.title,
        status: article.status,
      },
      actor,
    );
  }
}

function countMoves(moves: PlanArticle[]) {
  let publishedCount = 0;
  let draftCount = 0;
  let archivedCount = 0;

  for (const move of moves) {
    if (move.status === ArticleStatus.PUBLISHED) {
      publishedCount += 1;
    } else if (move.status === ArticleStatus.ARCHIVED) {
      archivedCount += 1;
    } else {
      draftCount += 1;
    }
  }

  return {
    movedCount: moves.length,
    publishedCount,
    draftCount,
    archivedCount,
  };
}

function emptyLinkPlan(): LinkRewritePlan {
  return { articles: [], articleCount: 0, linkCount: 0 };
}

async function previewLinkRewrite(
  client: ReadClient,
  oldPath: string,
  newPath: string,
): Promise<LinkRewritePlan> {
  const rules = [{ from: oldPath, to: newPath }];
  const candidates = await findLinkRewriteCandidates(client, rules);

  return planLinkRewrite(candidates, rules, { siteUrl: getSiteUrl() });
}

async function rewriteLinksInArticles(
  tx: Prisma.TransactionClient,
  rules: Array<{ from: string; to: string }>,
  options: { actorId: string; source: PathChangeSource },
): Promise<{
  plan: LinkRewritePlan;
  rewrittenArticles: Array<{
    id: string;
    path: string;
    title: string;
    status: ArticleStatus;
    updatedAt: Date;
  }>;
}> {
  const candidates = await findLinkRewriteCandidates(tx, rules);
  const plan = planLinkRewrite(candidates, rules, { siteUrl: getSiteUrl() });
  const rewrittenArticles: Array<{
    id: string;
    path: string;
    title: string;
    status: ArticleStatus;
    updatedAt: Date;
  }> = [];

  for (const article of plan.articles) {
    const updated = await tx.article.update({
      where: { id: article.id },
      data: { markdown: article.markdown },
      select: {
        id: true,
        path: true,
        title: true,
        status: true,
        markdown: true,
        updatedAt: true,
      },
    });

    await snapshotArticleRevision(tx, updated, options.actorId);
    await tx.log.create({
      data: {
        action: LogAction.UPDATE_ARTICLE,
        targetType: "Article",
        targetId: updated.id,
        detail: JSON.stringify({
          title: updated.title,
          path: updated.path,
          status: updated.status,
          reason: "path-change-link-rewrite",
          rewrittenCount: article.count,
          source: options.source,
        }),
        userId: options.actorId,
      },
    });

    rewrittenArticles.push({
      id: updated.id,
      path: updated.path,
      title: updated.title,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  }

  return { plan, rewrittenArticles };
}

async function findLinkRewriteCandidates(
  client: ReadClient,
  rules: Array<{ from: string; to: string }>,
) {
  const patterns = buildLinkRewritePatterns(rules);

  if (!patterns.length) {
    return [];
  }

  return client.article.findMany({
    where: {
      OR: patterns.map((pattern) => ({
        markdown: { contains: pattern, mode: "insensitive" as const },
      })),
    },
    select: { id: true, title: true, markdown: true },
    take: MAX_LINK_REWRITE_ARTICLES,
  });
}

function toArticleUpdateData(data: PathChangeArticleData) {
  return {
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.tags !== undefined ? { tags: data.tags } : {}),
    ...(data.editor !== undefined ? { editor: data.editor } : {}),
    ...(data.markdown !== undefined ? { markdown: data.markdown } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(data.publishedAt !== undefined ? { publishedAt: data.publishedAt } : {}),
  };
}
