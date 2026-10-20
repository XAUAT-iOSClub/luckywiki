import { revalidatePath, revalidateTag } from "next/cache";
import { ArticleStatus } from "@/generated/prisma/enums";
import { canWriteArticles } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import {
  ARTICLE_IMPORT_MAX_FILES,
  ArticleImportValidationError,
} from "@/lib/articles/import-files";
import {
  applyArticleImport,
  planArticleImport,
} from "@/lib/articles/import-service";
import {
  ARTICLES_CACHE_TAG,
  articleCacheTag,
  articleCommentsCacheTag,
} from "@/lib/cache-tags";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import { locales } from "@/lib/i18n/config";
import { buildWikiHref } from "@/lib/wiki/path";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentSession();

  if (!session) {
    return Response.json(
      { code: "UNAUTHORIZED", error: "You must sign in to import articles." },
      { status: 401 },
    );
  }

  if (!canWriteArticles(session.user)) {
    return Response.json(
      {
        code: "FORBIDDEN",
        error: "You do not have permission to import articles.",
      },
      { status: 403 },
    );
  }

  try {
    const formData = await request.formData();
    const mode = formData.get("mode") === "apply" ? "apply" : "preview";
    const prefix = String(formData.get("prefix") ?? "");
    const defaultStatus = parseStatus(formData.get("status"));
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File);

    if (files.length > ARTICLE_IMPORT_MAX_FILES) {
      throw new ArticleImportValidationError(
        "TOO_MANY_FILES",
        `A maximum of ${ARTICLE_IMPORT_MAX_FILES} files can be imported at once.`,
        413,
      );
    }

    const sources = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        size: file.size,
        content: await file.text(),
      })),
    );

    if (mode === "preview") {
      const plan = await planArticleImport({
        files: sources,
        prefix,
        defaultStatus,
      });

      return Response.json({
        data: {
          items: plan.items,
          summary: plan.summary,
        },
      });
    }

    const selectedPaths = parseSelectedPaths(formData.get("paths"));
    const plan = await planArticleImport({
      files: sources,
      prefix,
      defaultStatus,
    });
    const result = await applyArticleImport({
      parsed: plan.parsed,
      selectedPaths,
      defaultStatus,
      authorId: session.user.id,
    });

    revalidateImportedArticles(result.affected);

    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof ArticleImportValidationError) {
      return Response.json(
        {
          code: error.code,
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status },
      );
    }

    console.error("[articles] markdown import failed", error);

    return Response.json(
      {
        code: "IMPORT_FAILED",
        error: "The import failed. Please try again.",
      },
      { status: 500 },
    );
  }
}

function parseStatus(value: FormDataEntryValue | null) {
  if (value === "draft") {
    return ArticleStatus.DRAFT;
  }

  if (value === null || value === "published") {
    return ArticleStatus.PUBLISHED;
  }

  throw new ArticleImportValidationError(
    "INVALID_STATUS",
    'The status must be either "draft" or "published".',
  );
}

function parseSelectedPaths(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ArticleImportValidationError(
      "NO_SELECTION",
      "Select at least one article to import.",
    );
  }

  try {
    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("Invalid selection.");
    }

    const paths = parsed.filter(
      (path): path is string => typeof path === "string",
    );

    if (paths.length !== parsed.length) {
      throw new Error("Invalid selection.");
    }

    return Array.from(new Set(paths));
  } catch {
    throw new ArticleImportValidationError(
      "NO_SELECTION",
      "Select at least one article to import.",
    );
  }
}

function revalidateImportedArticles(affected: Array<{ id: string; path: string }>) {
  revalidateTag(ARTICLES_CACHE_TAG, { expire: 0 });

  for (const article of affected) {
    revalidateTag(articleCacheTag(article.path), { expire: 0 });
    revalidateTag(articleCommentsCacheTag(article.id), { expire: 0 });

    for (const locale of locales) {
      revalidatePath(buildWikiHref(article.path, locale));
    }
  }

  revalidateLocalizedPath("/admin/articles");
  revalidateLocalizedPath("/admin");
  revalidateLocalizedPath("/admin/taxonomy");
}
