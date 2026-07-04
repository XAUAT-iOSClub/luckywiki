import { NextResponse } from "next/server";
import { listPublishedArticleTreeData } from "@/lib/articles";
import { buildWikiTree } from "@/lib/wiki/tree";

export async function GET() {
  try {
    const articles = await listPublishedArticleTreeData();
    const tree = buildWikiTree(articles);
    return NextResponse.json({ data: tree });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list pages." },
      { status: 500 },
    );
  }
}
