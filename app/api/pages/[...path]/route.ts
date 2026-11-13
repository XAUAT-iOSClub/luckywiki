import { NextResponse } from "next/server";
import {
  getPublishedArticleByPath,
  listPublishedArticleComments,
} from "@/lib/articles";
import { resolveWikiPath } from "@/lib/articles/redirects";
import { canonicalizePath } from "@/lib/wiki/path";

function encodeArticlePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const rawPath = path.join("/");
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const commentsPage = Math.max(1, Number.parseInt(searchParams.get("commentsPage") ?? "1", 10) || 1);
  const commentsPageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("commentsPageSize") ?? "20", 10) || 20),
  );

  let articlePath: string;

  try {
    articlePath = canonicalizePath(rawPath);
  } catch {
    articlePath = rawPath;
  }

  try {
    const article = await getPublishedArticleByPath(articlePath);

    if (!article) {
      // Old URLs keep working: answer with a real 308 instead of a bare 404.
      const resolution = await resolveWikiPath(articlePath);

      if (resolution.type === "redirect") {
        const redirectUrl = new URL(
          `/api/pages/${encodeArticlePath(resolution.path)}`,
          request.url,
        );
        redirectUrl.search = requestUrl.search;

        return NextResponse.redirect(redirectUrl, 308);
      }

      if (resolution.type === "gone") {
        return NextResponse.json({ error: "Article is archived." }, { status: 410 });
      }

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
