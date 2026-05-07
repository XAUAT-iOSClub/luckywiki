"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireVerifiedSession } from "@/lib/session";

export type CommentActionState = {
  error?: string;
  success?: string;
};

const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment cannot be empty.")
    .max(5000, "Comment is too long."),
});

export async function createCommentAction(
  articleId: string,
  currentPath: string,
  _previousState: CommentActionState,
  formData: FormData,
): Promise<CommentActionState> {
  const session = await requireVerifiedSession(currentPath);
  const parsed = commentSchema.safeParse({
    body: String(formData.get("body") ?? ""),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid comment.",
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
    success: "Comment submitted for review.",
  };
}
