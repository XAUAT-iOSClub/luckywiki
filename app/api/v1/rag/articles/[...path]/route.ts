import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateRagRequest } from "@/lib/rag/auth";
import { checkRagRateLimit } from "@/lib/rag/rate-limit";
import {
  RagAuthError,
  RagRateLimitError,
} from "@/lib/rag/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const auth = await authenticateRagRequest(request);
    checkRagRateLimit(auth.identity, auth.hourlyLimit);

    const { path } = await params;
    const articlePath = path.map(decodeURIComponent).join("/");

    const article = await prisma.article.findFirst({
      where: {
        path: articlePath,
        status: "PUBLISHED",
      },
      select: {
        path: true,
        title: true,
        description: true,
        markdown: true,
        tags: true,
        updatedAt: true,
      },
    });

    if (!article) {
      return NextResponse.json(
        {
          error: {
            code: "not_found",
            message: "Article not found",
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      path: article.path,
      title: article.title,
      description: article.description,
      content: article.markdown,
      tags: article.tags,
      updated_at: article.updatedAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof RagAuthError) {
      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 },
      );
    }

    if (error instanceof RagRateLimitError) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((error.resetAt - Date.now()) / 1000),
      );

      return NextResponse.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many requests",
            retry_after_seconds: retryAfterSeconds,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Failed to load article",
        },
      },
      { status: 500 },
    );
  }
}
