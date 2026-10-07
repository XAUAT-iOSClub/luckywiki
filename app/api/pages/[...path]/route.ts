import { NextResponse } from "next/server";
import {
  getPublishedArticleByPath,
  listPublishedArticleComments,
} from "@/lib/articles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const articlePath = path.join("/");
  const searchParams = new URL(request.url).searchParams;
  const commentsPage = Math.max(1, Number.parseInt(searchParams.get("commentsPage") ?? "1", 10) || 1);
  const commentsPageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("commentsPageSize") ?? "20", 10) || 20),
  );

  try {
    const article = await getPublishedArticleByPath(articlePath);

    if (!article) {
      return NextResponse.json(
        { error: "Article not found." },
        { status: 404 },
      );
    }

    const comments = await listPublishedArticleComments(
      article.id,
      commentsPage,
      commentsPageSize,
    );
    return NextResponse.json({
      data: {
        ...article,
        comments: comments.comments,
        commentsPage: comments.page,
        totalComments: comments.totalCount,
        totalCommentPages: comments.totalPages,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch article." },
      { status: 500 },
    );
  }
}
