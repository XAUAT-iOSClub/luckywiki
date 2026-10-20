import {
  buildAttachmentContentDisposition,
  getArticleExportFileName,
  serializeArticleMarkdown,
} from "@/lib/articles/export";
import { canWriteArticles } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();

  if (!session) {
    return Response.json(
      { code: "UNAUTHORIZED", error: "You must sign in to export articles." },
      { status: 401 },
    );
  }

  if (!canWriteArticles(session.user)) {
    return Response.json(
      {
        code: "FORBIDDEN",
        error: "You do not have permission to export articles.",
      },
      { status: 403 },
    );
  }

  const { id } = await params;
  const article = await prisma.article.findUnique({ where: { id } });

  if (!article) {
    return Response.json(
      { code: "NOT_FOUND", error: "The article could not be found." },
      { status: 404 },
    );
  }

  return new Response(serializeArticleMarkdown(article), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": buildAttachmentContentDisposition(
        getArticleExportFileName(article),
      ),
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
