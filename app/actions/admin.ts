"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
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
import {
  applyPathChange,
  getPathChangeCacheInput,
  previewPathChange,
  publishPathChangeSideEffects,
  type PathChangePreview,
  type PathChangeStatus,
} from "@/lib/articles/path-change";
import { invalidatePathChangeCaches } from "@/lib/articles/cache";
import { clearWikiPathResolutionCache } from "@/lib/articles/redirect-decision";
import { releasePathRedirects } from "@/lib/articles/redirects";
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
  | {
      ok: true;
      path?: string;
      movedCount?: number;
      redirectsCreated?: number;
      linkRewriteCount?: number;
    }
  | { ok: false; error: string };

export type PathChangePreviewActionResult =
  | { ok: true; preview: PathChangePreview }
  | { ok: false; error: string; preview: PathChangePreview };

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

      // Reusing a path always wins over its old redirect.
      await releasePathRedirects(tx, [created.path]);
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
    // Path changes are a move, not a plain field update: they must cascade to
    // child pages, write redirects and (optionally) rewrite internal links.
    if (parsed.data.path !== existing.path) {
      const { path: nextPath, ...articleData } = parsed.data;
      const result = await applyPathChange({
        target: { kind: "article", articleId },
        nextPathInput: nextPath,
        actorId: session.user.id,
        source: "editor",
        rewriteLinks: formData.get("rewriteLinks") !== "0",
        primaryData: {
          ...articleData,
          publishedAt:
            parsed.data.status === ArticleStatus.PUBLISHED
              ? existing.publishedAt ?? new Date()
              : null,
        },
      });

      if (result.status !== "ok") {
        return { error: getPathChangeErrorMessage(result.status, dictionary) };
      }

      await publishPathChangeSideEffects(result, webhookActor(session));

      // 与普通保存一致：草稿改为已发布时补发 article.published
      if (
        result.primaryArticle &&
        existing.status !== ArticleStatus.PUBLISHED &&
        result.primaryArticle.status === ArticleStatus.PUBLISHED
      ) {
        dispatchWebhookEventAfterResponse(
          WEBHOOK_EVENTS.ARTICLE_PUBLISHED,
          {
            id: result.primaryArticle.id,
            path: result.primaryArticle.path,
            title: result.primaryArticle.title,
            status: result.primaryArticle.status,
          },
          webhookActor(session),
        );
      }

      invalidatePathChangeCaches(
        {
          ...getPathChangeCacheInput(result),
          rewrittenPaths: result.rewrittenArticles.map((article) => article.path),
          rewrittenArticleIds: result.rewrittenArticles.map((article) => article.id),
        },
        { mode: "action" },
      );

      return { success: getArticleListHref(locale, parsed.data.status) };
    }

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

      // Path has not changed, but a redirect must never shadow this page.
      await releasePathRedirects(tx, [updated.path]);
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

    invalidateArticleCache(article.path, article.id);
    revalidateWikiPaths(article.path);
    revalidateLocalizedPath("/admin/articles");
    revalidateLocalizedPath(`/admin/articles/${article.id}/history`);
    revalidateLocalizedPath("/admin");
    revalidateLocalizedPath("/admin/taxonomy");
    revalidateLocalizedPath("/admin/users");

    // 更新完成后也跳到对应状态列表，保持与创建行为一致
    return { success: getArticleListHref(locale, article.status) };
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

  // Old paths may have been cached as "no redirect"; drop that for this process
  // so archived pages answer 410 immediately.
  clearWikiPathResolutionCache();

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
  clearWikiPathResolutionCache();

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
  options?: { rewriteLinks?: boolean },
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

  if (nextPath === existing.path) {
    return { ok: true, path: existing.path };
  }

  try {
    const result = await applyPathChange({
      target: { kind: "article", articleId },
      nextPathInput,
      actorId: session.user.id,
      source: "article-page",
      rewriteLinks: options?.rewriteLinks,
    });

    if (result.status === "same") {
      return { ok: true, path: result.currentPath };
    }

    if (result.status !== "ok") {
      return { ok: false, error: getPathChangeErrorMessage(result.status, dictionary) };
    }

    await publishPathChangeSideEffects(result, webhookActor(session));
    invalidatePathChangeCaches(
      {
        ...getPathChangeCacheInput(result),
        rewrittenPaths: result.rewrittenArticles.map((article) => article.path),
        rewrittenArticleIds: result.rewrittenArticles.map((article) => article.id),
      },
      { mode: "action" },
    );

    return {
      ok: true,
      path: result.nextPath,
      movedCount: result.moves.length,
      redirectsCreated: result.redirectsCreated,
      linkRewriteCount: result.linkRewriteCount,
    };
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
}

/** 预览单篇文章改路径的影响面（编辑器与移动对话框共用）。 */
export async function previewArticlePathChangeAction(
  articleId: string,
  locale: Locale,
  nextPathInput: string,
): Promise<PathChangePreviewActionResult> {
  const [dictionary] = await Promise.all([
    getDictionary(locale),
    requireAuthorSession(locale),
  ]);

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true },
  });

  if (!existing) {
    return {
      ok: false,
      error: dictionary.feedback.articleNotFound,
      preview: buildEmptyPreview(nextPathInput),
    };
  }

  return buildPathChangePreviewResult(
    { kind: "article", articleId },
    nextPathInput,
    dictionary,
  );
}

/** 预览文件夹重命名 / 移动的影响面（仅 ROOT）。 */
export async function previewFolderPathChangeAction(
  locale: Locale,
  folderPath: string,
  nextPathInput: string,
): Promise<PathChangePreviewActionResult> {
  const [dictionary] = await Promise.all([
    getDictionary(locale),
    requireRootSession(locale),
  ]);

  return buildPathChangePreviewResult(
    { kind: "folder", path: folderPath },
    nextPathInput,
    dictionary,
  );
}

/** 文件夹重命名 / 移动：整棵前缀子树一次搬走（仅 ROOT）。 */
export async function renameFolderAction(
  locale: Locale,
  folderPath: string,
  nextPathInput: string,
  options?: { rewriteLinks?: boolean },
): Promise<ArticlePageActionResult> {
  const [dictionary, session] = await Promise.all([
    getDictionary(locale),
    requireRootSession(locale),
  ]);

  try {
    const result = await applyPathChange({
      target: { kind: "folder", path: folderPath },
      nextPathInput,
      actorId: session.user.id,
      source: "folder-rename",
      rewriteLinks: options?.rewriteLinks,
    });

    if (result.status === "same") {
      return { ok: true, path: result.currentPath };
    }

    if (result.status !== "ok") {
      return { ok: false, error: getPathChangeErrorMessage(result.status, dictionary) };
    }

    await publishPathChangeSideEffects(result, webhookActor(session));
    invalidatePathChangeCaches(
      {
        ...getPathChangeCacheInput(result),
        rewrittenPaths: result.rewrittenArticles.map((article) => article.path),
        rewrittenArticleIds: result.rewrittenArticles.map((article) => article.id),
      },
      { mode: "action" },
    );

    return {
      ok: true,
      path: result.nextPath,
      movedCount: result.moves.length,
      redirectsCreated: result.redirectsCreated,
      linkRewriteCount: result.linkRewriteCount,
    };
  } catch (error) {
    return {
      ok: false,
      error: getActionErrorMessage(
        error,
        dictionary.feedback.duplicatePath,
        dictionary.admin.pathChange.renameFailed,
      ),
    };
  }
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
  clearWikiPathResolutionCache();
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

function getArticleListHref(locale: Locale, status: ArticleStatus) {
  const statusQuery =
    status === ArticleStatus.PUBLISHED
      ? "?status=PUBLISHED"
      : status === ArticleStatus.DRAFT
        ? "?status=DRAFT"
        : "";

  return `${localizeHref(locale, "/admin/articles")}${statusQuery}`;
}

function getPathChangeErrorMessage(
  status: Exclude<PathChangeStatus, "ok"> | PathChangeStatus,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
) {
  switch (status) {
    case "empty":
      return dictionary.wiki.pageActions.pathRequired;
    case "invalid":
      return dictionary.feedback.invalidArticlePath;
    case "not-found":
      return dictionary.feedback.articleNotFound;
    case "descendant":
      return dictionary.wiki.pageActions.moveIntoItself;
    case "conflict":
      return dictionary.wiki.pageActions.moveConflict;
    case "reserved":
      return dictionary.admin.pathChange.reservedPath;
    case "protected-home":
      return dictionary.admin.pathChange.protectedHome;
    case "protected-root":
      return dictionary.admin.pathChange.protectedRoot;
    case "too-many":
      return dictionary.admin.pathChange.tooMany;
    default:
      return dictionary.feedback.somethingWentWrong;
  }
}

function buildEmptyPreview(nextPathInput: string): PathChangePreview {
  return {
    status: "invalid",
    currentPath: "",
    nextPath: nextPathInput.trim(),
    movedCount: 0,
    publishedCount: 0,
    draftCount: 0,
    archivedCount: 0,
    redirectCount: 0,
    linkArticleCount: 0,
    linkCount: 0,
    conflictPath: null,
  };
}

async function buildPathChangePreviewResult(
  target:
    | { kind: "article"; articleId: string }
    | { kind: "folder"; path: string },
  nextPathInput: string,
  dictionary: Awaited<ReturnType<typeof getDictionary>>,
): Promise<PathChangePreviewActionResult> {
  const preview = await previewPathChange(target, nextPathInput);

  if (preview.status === "ok") {
    return { ok: true, preview };
  }

  return {
    ok: false,
    error: getPathChangeErrorMessage(preview.status, dictionary),
    preview,
  };
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
