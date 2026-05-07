import { CommentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";

export async function listCommentsForModeration(status?: CommentStatus) {
  return prisma.comment.findMany({
    where: status ? { status } : undefined,
    include: {
      article: {
        select: {
          id: true,
          path: true,
          title: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      approver: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });
}
