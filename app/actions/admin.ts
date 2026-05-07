"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ArticleStatus, CommentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { buildWikiHref, canonicalizePath } from "@/lib/wiki-path";
import { requireRootSession } from "@/lib/session";

export type FormActionState = {
  error?: string;
  success?: string;
};

const articleSchema = z.object({
  title: z.string().trim().min(1, "Title is required."),
  path: z.string(),
  markdown: z.string(),
  status: z.enum([ArticleStatus.DRAFT, ArticleStatus.PUBLISHED]),
});

export async function createArticleAction(
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const session = await requireRootSession();
  const parsed = parseArticleForm(formData);

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

    revalidateWikiPaths(article.path);
    revalidatePath("/admin/articles");

    return { success: `/admin/articles/${article.id}` };
  } catch (error) {
    return { error: getActionErrorMessage(error) };
  }
}

export async function updateArticleAction(
  articleId: string,
  _previousState: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  await requireRootSession();
  const parsed = parseArticleForm(formData);

  if (!parsed.success) {
    return { error: parsed.error };
  }

  const existing = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!existing) {
    return { error: "Article not found." };
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

    revalidateWikiPaths(existing.path);
    revalidateWikiPaths(article.path);
    revalidatePath("/admin/articles");

    return { success: "Saved article changes." };
  } catch (error) {
    return { error: getActionErrorMessage(error) };
  }
}

export async function approveCommentAction(commentId: string) {
  const session = await requireRootSession();
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

  revalidatePath("/admin/comments");
  revalidateWikiPaths(comment.article.path);
}

export async function rejectCommentAction(commentId: string) {
  const session = await requireRootSession();
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

  revalidatePath("/admin/comments");
  revalidateWikiPaths(comment.article.path);
}
function parseArticleForm(formData: FormData) {
  const raw = {
    title: String(formData.get("title") ?? ""),
    path: String(formData.get("path") ?? ""),
    markdown: String(formData.get("markdown") ?? ""),
    status: String(formData.get("status") ?? ArticleStatus.DRAFT),
  };

  const result = articleSchema.safeParse(raw);

  if (!result.success) {
    return {
      success: false as const,
      error: result.error.issues[0]?.message ?? "Invalid article input.",
    };
  }

  try {
    return {
      success: true as const,
      data: {
        ...result.data,
        path: canonicalizePath(result.data.path),
      },
    };
  } catch (error) {
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Invalid article path.",
    };
  }
}

function getActionErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return "That path is already used by another article.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong. Please try again.";
}

function revalidateWikiPaths(path: string) {
  revalidatePath("/wiki");
  revalidatePath(buildWikiHref(path));
}
