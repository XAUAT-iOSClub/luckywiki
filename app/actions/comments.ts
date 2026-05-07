"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";
import { prisma } from "@/lib/prisma";
import { requireVerifiedSession } from "@/lib/session";

export type CommentActionState = {
  error?: string;
  success?: string;
};

export async function createCommentAction(
  locale: Locale,
  articleId: string,
  currentPath: string,
  _previousState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const [session, dictionary] = await Promise.all([
    requireVerifiedSession(locale, currentPath),
    getDictionary(locale),
  ]);
  const commentSchema = z.object({
    body: z
      .string()
      .trim()
      .min(1, dictionary.feedback.commentEmpty)
      .max(5000, dictionary.feedback.commentTooLong),
  });
  const parsed = commentSchema.safeParse({
    body: String(formData.get("body") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? dictionary.feedback.invalidComment,
    };
  }

  await prisma.comment.create({
    data: {
      articleId,
      authorId: session.user.id,
      body: parsed.data.body,
    },
  });

  revalidatePath(currentPath);

  return {
    success: dictionary.wiki.commentSuccess,
  };
}
