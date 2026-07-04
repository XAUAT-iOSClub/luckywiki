import { NextResponse } from "next/server";
import { getPublishedArticleByPath } from "@/lib/articles";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const articlePath = path.join("/");

  try {
    const article = await getPublishedArticleByPath(articlePath);

    if (!article) {
      return NextResponse.json(
        { error: "Article not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: article });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch article." },
      { status: 500 },
    );
  }
}
