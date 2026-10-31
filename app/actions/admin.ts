"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { ArticleModel } from "@/generated/prisma/models/Article";
import { ArticleStatus, CommentStatus, LogAction, Role } from "@/generated/prisma/enums";
import type { Locale } from "@/lib/i18n/config";
import { locales, localizeHref } from "@/lib/i18n/config";
import {
  articleCacheTag,
  articleCommentsCacheTag,
  ARTICLES_CACHE_TAG,
} from "@/lib/cache-tags";
import { enqueueArticleEmbeddingSync } from "@/lib/embedding-queue";
import {
  dispatchWebhookEventAfterResponse,
  WEBHOOK_EVENTS,
} from "@/lib/webhook/delivery";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { prisma } from "@/lib/prisma";
import { getPublishedArticleByPath } from "@/lib/articles";
import type { ArticleHeaderInfo } from "@/lib/articles/header";
import { planArticlePathMove } from "@/lib/articles/move";
import { snapshotArticleRevision } from "@/lib/articles/revisions";
import { syncArticleMediaReferences } from "@/lib/media/references";
import {
  buildWikiHref,
  canonicalizePath,
  isReservedWikiPath,
} from "@/lib/wiki/path";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import { canChangeUserRole, canWriteArticles } from "@/lib/auth/permissions";
import {
  getCurrentSession,
  requireAuthorSession,
  requireRootSession,
} from "@/lib/auth/session";

export type FormActionState = {
  error?: string;
  success?: string;
};

/** 把当前会话用户转成 webhook payload 里的操作账号 */
function webhookActor(session: { user: { id: string; name: string; email: string } }) {
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}

export type ArticlePageActionResult =
  | { ok: true; path?: string }
  | { ok: false; error: string };

export async function createArticleAction(
  locale: Locale,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const [session, dictionary] = await Promise.all([
    requireAuthorSession(locale),
    getDictionary(locale),
  ]);
  const parsed = parseArticleForm(formData, dictionary);

  if (!parsed.success) {
    return { error: parsed.error };
  }

  try {
    const article = await prisma.$transaction(async (tx) => {
      const created = await tx.article.create({
        data: {
          ...parsed.data,
          authorId: session.user.id,
          publishedAt:
            parsed.data.status === ArticleStatus.PUBLISHED ? new Date() : null,
        },
      });

      await snapshotArticleRevision(tx, created, session.user.id, { force: true });
      await syncArticleMediaReferences(tx, created.id, created.markdown);
      await createLog(
        {
          action: LogAction.CREATE_ARTICLE,
          targetType: "Article",
          targetId: created.id,
          detail: JSON.stringify({
            title: created.title,
            path: created.path,
            status: created.status,
          }),
          userId: session.user.id,
        },
        tx,
      );

      return created;
    });

    await enqueueArticleEmbeddingSync({
      articleId: article.id,
      updatedAt: article.updatedAt.toISOString(),
    });

    // 任何新建都发 article.created；直接以已发布创建时追加 article.published
    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_CREATED,
      {
        id: article.id, path: article.path, title: article.title, status: article.status,
      },
      webhookActor(session),
    );
    if (article.status === ArticleStatus.PUBLISHED) {
      dispatchWebhookEventAfterResponse(
        WEBHOOK_EVENTS.ARTICLE_PUBLISHED,
        {
          id: article.id, path: article.path, title: article.title, status: article.status,
        },
        webhookActor(session),
      );
    }

    invalidateArticleCache(article.path, article.id);
    revalidateWikiPaths(article.path);
    revalidateLocalizedPath("/admin/articles");
    revalidateLocalizedPath("/admin");
    revalidateLocalizedPath("/admin/taxonomy");
    revalidateLocalizedPath("/admin/users");

    // 创建完成后直接跳到对应状态列表（草稿→草稿列表，已发布→已发布列表）
    const statusQuery =
      article.status === ArticleStatus.PUBLISHED
        ? "?status=PUBLISHED"
        : article.status === ArticleStatus.DRAFT
          ? "?status=DRAFT"
          : "";
    return { success: `${localizeHref(locale, "/admin/articles")}${statusQuery}` };
  } catch (error) {
    return { error: getActionErrorMessage(error, dictionary.feedback.duplicatePath, dictionary.feedback.somethingWentWrong) };
  }
}

export async function updateArticleAction(
  articleId: string,
  locale: Locale,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireAuthorSession(locale),
  ]);
  const parsed = parseArticleForm(formData, dictionary);

  if (!parsed.success) {
    return { error: parsed.error };
  }

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!existing) {
    return { error: dictionary.feedback.articleNotFound };
  }

  try {
    const article = await prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: articleId },
        data: {
          ...parsed.data,
          publishedAt:
            parsed.data.status === ArticleStatus.PUBLISHED
              ? existing.publishedAt ?? new Date()
              : null,
        },
      });

      await snapshotArticleRevision(tx, updated, session.user.id);
      await syncArticleMediaReferences(tx, updated.id, updated.markdown);
      await createLog(
        {
          action: LogAction.UPDATE_ARTICLE,
          targetType: "Article",
          targetId: articleId,
          detail: JSON.stringify({
            title: updated.title,
            path: updated.path,
            status: updated.status,
            ...(existing.path !== updated.path ? { oldPath: existing.path } : {}),
          }),
          userId: session.user.id,
        },
        tx,
      );

      return updated;
    });

    await enqueueArticleEmbeddingSync({
      articleId: article.id,
      updatedAt: article.updatedAt.toISOString(),
    });

    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_UPDATED,
      {
        id: article.id, path: article.path, title: article.title, status: article.status,
      },
      webhookActor(session),
    );
    // 编辑器保存时把草稿改为已发布，等同一次发布，需补发 article.published
    if (existing.status !== ArticleStatus.PUBLISHED && article.status === ArticleStatus.PUBLISHED) {
      dispatchWebhookEventAfterResponse(
        WEBHOOK_EVENTS.ARTICLE_PUBLISHED,
        {
          id: article.id, path: article.path, title: article.title, status: article.status,
        },
        webhookActor(session),
      );
    }

    invalidateArticleCache(existing.path, existing.id);
    invalidateArticleCache(article.path, article.id);
    revalidateWikiPaths(existing.path);
    revalidateWikiPaths(article.path);
    revalidateLocalizedPath("/admin/articles");
    revalidateLocalizedPath(`/admin/articles/${article.id}/history`);
    revalidateLocalizedPath("/admin");
    revalidateLocalizedPath("/admin/taxonomy");
    revalidateLocalizedPath("/admin/users");

    // 更新完成后也跳到对应状态列表，保持与创建行为一致
    const statusQuery =
      article.status === ArticleStatus.PUBLISHED
        ? "?status=PUBLISHED"
        : article.status === ArticleStatus.DRAFT
          ? "?status=DRAFT"
          : "";
    return { success: `${localizeHref(locale, "/admin/articles")}${statusQuery}` };
  } catch (error) {
    return { error: getActionErrorMessage(error, dictionary.feedback.duplicatePath, dictionary.feedback.somethingWentWrong) };
  }
}

/** 归档（软删除）：把文章状态改为 ARCHIVED，前台不展示，后台可恢复 */
export async function archiveArticleAction(
  locale: Locale,
  articleId: string,
): Promise<ArticlePageActionResult> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireAuthorSession(locale),
  ]);

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      path: true,
      title: true,
      status: true,
    },
  });

  if (!existing) {
    return { ok: false, error: dictionary.feedback.articleNotFound };
  }

  if (existing.status === ArticleStatus.ARCHIVED) {
    return { ok: true }; // 已归档，幂等
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.article.update({
        where: { id: articleId },
        data: { status: ArticleStatus.ARCHIVED },
      });

      await createLog(
        {
          action: LogAction.ARCHIVE_ARTICLE,
          targetType: "Article",
          targetId: articleId,
          detail: JSON.stringify({
            title: existing.title,
            path: existing.path,
          }),
          userId: session.user.id,
        },
        tx,
      );
    });
  } catch {
    return { ok: false, error: dictionary.wiki.pageActions.archiveFailed };
  }

  // 归档后需要同步检索索引，否则 AI 搜索仍会命中已归档内容
  await enqueueArticleEmbeddingSync({
    articleId: existing.id,
    updatedAt: new Date().toISOString(),
  });

  invalidateArticleCache(existing.path, existing.id);
  revalidateWikiPaths(existing.path);
  revalidateLocalizedPath(`/admin/articles/${existing.id}`);
  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/taxonomy");

  dispatchWebhookEventAfterResponse(
    WEBHOOK_EVENTS.ARTICLE_ARCHIVED,
    {
      id: existing.id, path: existing.path, title: existing.title, status: ArticleStatus.ARCHIVED,
    },
    webhookActor(session),
  );

  return { ok: true };
}

/** 从归档恢复：恢复到草稿箱，由作者确认后再发布 */
export async function restoreArticleAction(
  locale: Locale,
  articleId: string,
): Promise<ArticlePageActionResult> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireAuthorSession(locale),
  ]);

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      path: true,
      title: true,
      status: true,
    },
  });

  if (!existing) {
    return { ok: false, error: dictionary.feedback.articleNotFound };
  }

  if (existing.status !== ArticleStatus.ARCHIVED) {
    return { ok: true }; // 未归档，无需恢复
  }

  try {
    const article = await prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: articleId },
        data: {
          status: ArticleStatus.DRAFT,
          publishedAt: null,
        },
      });

      await createLog(
        {
          action: LogAction.RESTORE_ARTICLE,
          targetType: "Article",
          targetId: articleId,
          detail: JSON.stringify({
            title: existing.title,
            path: existing.path,
          }),
          userId: session.user.id,
        },
        tx,
      );

      return updated;
    });

    await enqueueArticleEmbeddingSync({
      articleId: article.id,
      updatedAt: article.updatedAt.toISOString(),
    });
  } catch {
    return { ok: false, error: dictionary.feedback.somethingWentWrong };
  }

  invalidateArticleCache(existing.path, existing.id);
  revalidateWikiPaths(existing.path);
  revalidateLocalizedPath(`/admin/articles/${existing.id}`);
  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  // 恢复到草稿箱，分类统计不受影响
  revalidateLocalizedPath("/admin/taxonomy");

  dispatchWebhookEventAfterResponse(
    WEBHOOK_EVENTS.ARTICLE_RESTORED,
    {
      id: existing.id, path: existing.path, title: existing.title, status: ArticleStatus.DRAFT,
    },
    webhookActor(session),
  );

  return { ok: true };
}

/** 硬删除：物理删除文章及所有关联数据（仅 ROOT） */
export async function hardDeleteArticleAction(
  locale: Locale,
  articleId: string,
): Promise<ArticlePageActionResult> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireRootSession(locale),
  ]);

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      path: true,
      title: true,
      status: true,
    },
  });

  if (!existing) {
    return { ok: false, error: dictionary.feedback.articleNotFound };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.article.delete({
        where: { id: articleId },
      });

      await createLog(
        {
          action: LogAction.HARD_DELETE_ARTICLE,
          targetType: "Article",
          targetId: articleId,
          detail: JSON.stringify({
            title: existing.title,
            path: existing.path,
          }),
          userId: session.user.id,
        },
        tx,
      );
    });
  } catch {
    return { ok: false, error: dictionary.wiki.pageActions.hardDeleteFailed };
  }

  invalidateArticleCache(existing.path, existing.id);
  revalidateWikiPaths(existing.path);
  revalidateLocalizedPath(`/admin/articles/${existing.id}`);
  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/taxonomy");

  // 删除前最后一次已知状态，便于接收方区分归档删除与其他来源的删除
  dispatchWebhookEventAfterResponse(
    WEBHOOK_EVENTS.ARTICLE_DELETED,
    {
      id: existing.id, path: existing.path, title: existing.title, status: existing.status,
    },
    webhookActor(session),
  );

  return { ok: true };
}

/** 表单提交包装：后台列表用 <form action> 触发，返回 void */
export async function archiveArticleFormAction(
  locale: Locale,
  articleId: string,
): Promise<void> {
  await archiveArticleAction(locale, articleId);
}

/** 表单提交包装：后台列表用 <form action> 触发，返回 void */
export async function restoreArticleFormAction(
  locale: Locale,
  articleId: string,
): Promise<void> {
  await restoreArticleAction(locale, articleId);
}

/** 表单提交包装：后台列表用 <form action> 触发，返回 void */
export async function hardDeleteArticleFormAction(
  locale: Locale,
  articleId: string,
): Promise<void> {
  await hardDeleteArticleAction(locale, articleId);
}

export async function moveArticleAction(
  locale: Locale,
  articleId: string,
  nextPathInput: string,
): Promise<ArticlePageActionResult> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireAuthorSession(locale),
  ]);

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      path: true,
      title: true,
    },
  });

  if (!existing) {
    return { ok: false, error: dictionary.feedback.articleNotFound };
  }

  let nextPath: string;

  try {
    nextPath = canonicalizePath(nextPathInput.trim());
  } catch {
    return { ok: false, error: dictionary.feedback.invalidArticlePath };
  }

  if (!nextPath) {
    return { ok: false, error: dictionary.wiki.pageActions.pathRequired };
  }

  if (nextPath === existing.path) {
    return { ok: true, path: existing.path };
  }

  if (nextPath.startsWith(`${existing.path}/`)) {
    return { ok: false, error: dictionary.wiki.pageActions.moveIntoItself };
  }

  const [sourceArticles, targetArticles] = await Promise.all([
    prisma.article.findMany({
      where: {
        OR: [
          { path: existing.path },
          { path: { startsWith: `${existing.path}/` } },
        ],
      },
      select: {
        id: true,
        path: true,
      },
    }),
    prisma.article.findMany({
      where: {
        OR: [
          { path: nextPath },
          { path: { startsWith: `${nextPath}/` } },
        ],
      },
      select: {
        id: true,
        path: true,
      },
    }),
  ]);

  const existingPaths = Array.from(
    new Set(
      [...sourceArticles, ...targetArticles].map((article) => article.path),
    ),
  );
  const plan = planArticlePathMove(existingPaths, existing.path, nextPath);

  if (plan.status === "conflict") {
    return { ok: false, error: dictionary.wiki.pageActions.moveConflict };
  }

  if (plan.status === "descendant") {
    return { ok: false, error: dictionary.wiki.pageActions.moveIntoItself };
  }

  if (plan.status === "same") {
    return { ok: true, path: existing.path };
  }

  if (plan.status === "invalid") {
    return { ok: false, error: dictionary.feedback.invalidArticlePath };
  }

  const sourceIdByPath = new Map(
    sourceArticles.map((article) => [article.path, article.id]),
  );
  const oldPaths = plan.moves.map((move) => move.from);
  const newPaths = plan.moves.map((move) => move.to);

  let movedArticles: ArticleModel[];

  try {
    movedArticles = await prisma.$transaction(async (tx) => {
      const updatedArticles: ArticleModel[] = [];

      for (const move of plan.moves) {
        const id = sourceIdByPath.get(move.from);

        if (!id) {
          throw new Error(`Missing source article for path "${move.from}".`);
        }

        updatedArticles.push(
          await tx.article.update({
            where: { id },
            data: { path: move.to },
          }),
        );
      }

      await createLog(
        {
          action: LogAction.UPDATE_ARTICLE,
          targetType: "Article",
          targetId: articleId,
          detail: JSON.stringify({
            title: existing.title,
            path: nextPath,
            oldPath: existing.path,
            movedPaths: plan.moves.length,
          }),
          userId: session.user.id,
        },
        tx,
      );

      return updatedArticles;
    });
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(
        error,
        dictionary.feedback.duplicatePath,
        dictionary.wiki.pageActions.moveFailed,
      ),
    };
  }

  updateTag(ARTICLES_CACHE_TAG);

  for (const path of new Set([...oldPaths, ...newPaths])) {
    updateTag(articleCacheTag(path));
  }

  for (const path of oldPaths) {
    revalidateWikiPaths(path);
  }

  for (const path of newPaths) {
    revalidateWikiPaths(path);
  }

  revalidateLocalizedPath(`/admin/articles/${articleId}`);
  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/taxonomy");
  revalidateLocalizedPath("/admin/users");

  // A queue hiccup should not report the move as failed after the database
  // already committed it; the next content save will re-index if needed.
  await Promise.all(
    movedArticles.map(async (article) => {
      try {
        await enqueueArticleEmbeddingSync({
          articleId: article.id,
          updatedAt: article.updatedAt.toISOString(),
        });
      } catch (error) {
        console.error(
          "[admin] failed to enqueue embedding sync after moving an article",
          error,
        );
      }
    }),
  );

  // 迁移会改变 URL，逐个派发 article.updated，避免下游保留旧路径
  for (const movedArticle of movedArticles) {
    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_UPDATED,
      {
        id: movedArticle.id,
        path: movedArticle.path,
        title: movedArticle.title,
        status: movedArticle.status,
      },
      webhookActor(session),
    );
  }

  return { ok: true, path: nextPath };
}

export async function restoreArticleRevisionAction(
  articleId: string,
  locale: Locale,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireAuthorSession(locale),
  ]);
  const revisionId = String(formData.get("revisionId") ?? "").trim();

  if (!revisionId) {
    return { error: dictionary.feedback.revisionNotFound };
  }

  const revision = await prisma.articleRevision.findFirst({
    where: {
      id: revisionId,
      articleId,
    },
  });

  if (!revision) {
    return { error: dictionary.feedback.revisionNotFound };
  }

  try {
    const article = await prisma.$transaction(async (tx) => {
      const updated = await tx.article.update({
        where: { id: articleId },
        data: {
          title: revision.title,
          markdown: revision.markdown,
        },
      });

      // A rollback is itself a save: it becomes a new revision so the content
      // that was just replaced remains recoverable.
      await snapshotArticleRevision(tx, updated, session.user.id);
      await syncArticleMediaReferences(tx, updated.id, updated.markdown);
      await createLog(
        {
          action: LogAction.RESTORE_ARTICLE,
          targetType: "Article",
          targetId: articleId,
          detail: JSON.stringify({
            title: updated.title,
            path: updated.path,
            status: updated.status,
            restoredFrom: revisionId,
          }),
          userId: session.user.id,
        },
        tx,
      );

      return updated;
    });

    await enqueueArticleEmbeddingSync({
      articleId: article.id,
      updatedAt: article.updatedAt.toISOString(),
    });

    // 回滚历史版本等同于一次内容更新
    dispatchWebhookEventAfterResponse(
      WEBHOOK_EVENTS.ARTICLE_UPDATED,
      {
        id: article.id, path: article.path, title: article.title, status: article.status,
      },
      webhookActor(session),
    );

    invalidateArticleCache(article.path, article.id);
    revalidateWikiPaths(article.path);
    revalidateLocalizedPath("/admin/articles");
    revalidateLocalizedPath(`/admin/articles/${article.id}/history`);
    revalidateLocalizedPath("/admin");
    revalidateLocalizedPath("/admin/taxonomy");

    return { success: localizeHref(locale, `/admin/articles/${article.id}`) };
  } catch {
    return { error: dictionary.feedback.somethingWentWrong };
  }
}

export async function getArticleHeaderInfoAction(
  path: string,
): Promise<ArticleHeaderInfo | null> {
  const session = await getCurrentSession();

  if (!canWriteArticles(session?.user ?? null)) {
    return null;
  }

  let canonicalPath: string;

  try {
    canonicalPath = canonicalizePath(path);
  } catch {
    return null;
  }

  if (!canonicalPath || isReservedWikiPath(canonicalPath)) {
    return null;
  }

  const article = await getPublishedArticleByPath(canonicalPath);

  if (!article) {
    return null;
  }

  return {
    id: article.id,
    path: article.path,
    title: article.title,
  };
}

export async function listArticlePathsAction(locale: "zh" | "en") {
  await requireAuthorSession(locale);
  
  return prisma.article.findMany({
    select: {
      path: true,
      title: true,
    },
    orderBy: {
      path: "asc",
    },
  });
}

export async function approveCommentAction(locale: Locale, commentId: string) {
  const session = await requireRootSession(locale);
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      article: {
        select: {
          id: true,
          path: true,
        },
      },
    },
  });

  if (!comment) {
    return;
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: {
      status: CommentStatus.APPROVED,
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  updateTag(articleCommentsCacheTag(comment.article.id));

  await createLog({
    action: LogAction.APPROVE_COMMENT,
    targetType: "Comment",
    targetId: commentId,
    detail: JSON.stringify({ articlePath: comment.article.path }),
    userId: session.user.id,
  });

  revalidateLocalizedPath("/admin/comments");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/users");
  revalidateWikiPaths(comment.article.path);
}

export async function rejectCommentAction(locale: Locale, commentId: string) {
  const session = await requireRootSession(locale);
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      article: {
        select: {
          id: true,
          path: true,
        },
      },
    },
  });

  if (!comment) {
    return;
  }

  await prisma.comment.update({
    where: { id: commentId },
    data: {
      status: CommentStatus.REJECTED,
      approvedById: session.user.id,
      approvedAt: new Date(),
    },
  });

  updateTag(articleCommentsCacheTag(comment.article.id));

  await createLog({
    action: LogAction.REJECT_COMMENT,
    targetType: "Comment",
    targetId: commentId,
    detail: JSON.stringify({ articlePath: comment.article.path }),
    userId: session.user.id,
  });

  revalidateLocalizedPath("/admin/comments");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/users");
  revalidateWikiPaths(comment.article.path);
}

export async function setArticleStatusAction(
  locale: Locale,
  articleId: string,
  status: ArticleStatus,
) {
  const session = await requireAuthorSession(locale);

  const existing = await prisma.article.findUnique({
    where: {
      id: articleId,
    },
  });

  if (!existing) {
    return;
  }

  const article = await prisma.article.update({
    where: {
      id: articleId,
    },
    data: {
      status,
      publishedAt:
        status === ArticleStatus.PUBLISHED
          ? existing.publishedAt ?? new Date()
          : null,
    },
  });
  await enqueueArticleEmbeddingSync({
    articleId: article.id,
    updatedAt: article.updatedAt.toISOString(),
  });

  await createLog({
    action: LogAction.SET_ARTICLE_STATUS,
    targetType: "Article",
    targetId: articleId,
    detail: JSON.stringify({
      oldStatus: existing.status,
      newStatus: status,
    }),
    userId: session.user.id,
  });

  // 发布状态变化也要通知 webhook 订阅方，与 REST/编辑器路径行为一致
  if (existing.status !== status) {
    dispatchWebhookEventAfterResponse(
      status === ArticleStatus.PUBLISHED
        ? WEBHOOK_EVENTS.ARTICLE_PUBLISHED
        : WEBHOOK_EVENTS.ARTICLE_UPDATED,
      { id: article.id, path: article.path, title: article.title, status: article.status },
      webhookActor(session),
    );
  }

  invalidateArticleCache(existing.path, existing.id);
  invalidateArticleCache(article.path, article.id);
  revalidateWikiPaths(existing.path);
  if (existing.path !== article.path) {
    revalidateWikiPaths(article.path);
  }
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin/taxonomy");
}

export async function setUserRoleAction(
  locale: Locale,
  userId: string,
  targetRole: Role,
) {
  const session = await requireRootSession(locale, localizeHref(locale, "/admin/articles"));

  const [targetUser, rootUsersCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    }),
    prisma.user.count({
      where: {
        role: Role.ROOT,
      },
    }),
  ]);

  if (!targetUser || !canChangeUserRole(targetUser.role, targetRole, rootUsersCount)) {
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: targetRole },
  });

  await createLog({
    action: LogAction.SET_USER_ROLE,
    targetType: "User",
    targetId: userId,
    detail: JSON.stringify({
      oldRole: targetUser.role,
      newRole: targetRole,
    }),
    userId: session.user.id,
  });

  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/users");
}

function parseArticleForm(
  formData: FormData,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  const articleSchema = z.object({
    title: z.string().trim().min(1, dictionary.feedback.titleRequired),
    path: z.string(),
    description: z.string().trim().max(280, dictionary.feedback.descriptionTooLong),
    tags: z.array(z.string().trim().min(1)).max(12, dictionary.feedback.tooManyTags),
    editor: z.string().trim().max(40, dictionary.feedback.editorNameTooLong),
    markdown: z.string(),
    status: z.enum([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED]),
  });
  const raw = {
    title: String(formData.get("title") ?? ""),
    path: String(formData.get("path") ?? ""),
    description: String(formData.get("description") ?? ""),
    tags: parseTags(String(formData.get("tags") ?? "")),
    editor: String(formData.get("editor") ?? ""),
    markdown: String(formData.get("markdown") ?? ""),
    status: String(formData.get("status") ?? ArticleStatus.DRAFT),
  };

  const result = articleSchema.safeParse(raw);

  if (!result.success) {
    return {
      success: false as const,
      error: result.error.issues[0]?.message ?? dictionary.feedback.invalidArticleInput,
    };
  }

  try {
    return {
      success: true as const,
      data: {
        ...result.data,
        path: canonicalizePath(result.data.path),
        description: normalizeOptionalString(result.data.description),
        editor: normalizeOptionalString(result.data.editor),
      },
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : dictionary.feedback.invalidArticlePath,
    };
  }
}

function getActionErrorMessage(
  error: unknown,
  duplicatePathMessage: string,
  fallbackMessage: string,
) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return duplicatePathMessage;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}

async function createLog(
  params: {
    action: LogAction;
    targetType: string;
    targetId: string;
    detail?: string;
    userId: string;
  },
  tx?: Prisma.TransactionClient,
) {
  const data = {
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    detail: params.detail ?? null,
    userId: params.userId,
  };

  if (tx) {
    await tx.log.create({ data });
    return;
  }

  await prisma.log.create({ data });
}

function revalidateWikiPaths(path: string) {
  revalidateLocalizedPath("/wiki");

  for (const locale of locales) {
    revalidatePath(buildWikiHref(path, locale));
  }
}

function invalidateArticleCache(path: string, articleId: string) {
  updateTag(ARTICLES_CACHE_TAG);
  updateTag(articleCacheTag(path));
  updateTag(articleCommentsCacheTag(articleId));
}

function parseTags(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeOptionalString(input: string) {
  const normalized = input.trim();
  return normalized ? normalized : null;
}
