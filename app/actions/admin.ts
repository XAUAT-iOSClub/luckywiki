"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ArticleStatus, CommentStatus, Role } from "@/generated/prisma/enums";
import type { Locale } from "@/lib/i18n/config";
import { locales, localizeHref } from "@/lib/i18n/config";
import { safeSyncArticleEmbeddingsForArticleId } from "@/lib/agent/index";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { prisma } from "@/lib/prisma";
import { buildWikiHref, canonicalizePath } from "@/lib/wiki/path";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import { canChangeUserRole } from "@/lib/auth/permissions";
import { requireAuthorSession, requireRootSession } from "@/lib/auth/session";

export type FormActionState = {
  error?: string;
  success?: string;
};

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
    const article = await prisma.article.create({
      data: {
        ...parsed.data,
        authorId: session.user.id,
        publishedAt:
          parsed.data.status === ArticleStatus.PUBLISHED ? new Date() : null,
      },
    });
    await safeSyncArticleEmbeddingsForArticleId(article.id);

    revalidateWikiPaths(article.path);
    revalidateLocalizedPath("/admin/articles");
    revalidateLocalizedPath("/admin");
    revalidateLocalizedPath("/admin/taxonomy");
    revalidateLocalizedPath("/admin/users");

    return { success: localizeHref(locale, `/admin/articles/${article.id}`) };
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
  const [dictionary] = await Promise.all([
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
    const article = await prisma.article.update({
      where: { id: articleId },
      data: {
        ...parsed.data,
        publishedAt:
          parsed.data.status === ArticleStatus.PUBLISHED
            ? existing.publishedAt ?? new Date()
            : null,
      },
    });
    await safeSyncArticleEmbeddingsForArticleId(article.id);

    revalidateWikiPaths(existing.path);
    revalidateWikiPaths(article.path);
    revalidateLocalizedPath("/admin/articles");
    revalidateLocalizedPath("/admin");
    revalidateLocalizedPath("/admin/taxonomy");
    revalidateLocalizedPath("/admin/users");

    return { success: dictionary.feedback.articleSaved };
  } catch (error) {
    return { error: getActionErrorMessage(error, dictionary.feedback.duplicatePath, dictionary.feedback.somethingWentWrong) };
  }
}

export async function listArticlePathsAction() {
  await requireAuthorSession();
  
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
  await requireAuthorSession(locale);

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
  await safeSyncArticleEmbeddingsForArticleId(article.id);

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
  await requireRootSession(locale, localizeHref(locale, "/admin/articles"));

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

function revalidateWikiPaths(path: string) {
  revalidateLocalizedPath("/wiki");

  for (const locale of locales) {
    revalidatePath(buildWikiHref(path, locale));
  }
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
