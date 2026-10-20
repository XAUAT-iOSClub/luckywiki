import { LogAction } from "@/generated/prisma/enums";
import type { ArticleStatus } from "@/generated/prisma/enums";
import {
  buildArticleImportPlan,
  parseArticleImportFiles,
  summarizeArticleImportPlan,
  validateArticleImportBatch,
  type ArticleImportPlanItem,
  type ArticleImportSourceFile,
  type ArticleImportSummary,
  type ParsedArticleImportFile,
} from "@/lib/articles/import-files";
import { resolveImportPublishedAt } from "@/lib/articles/import";
import { snapshotArticleRevision } from "@/lib/articles/revisions";
import { enqueueArticleEmbeddingSync } from "@/lib/embedding-queue";
import { syncArticleMediaReferences } from "@/lib/media/references";
import { prisma } from "@/lib/prisma";

const existingArticleSelect = {
  id: true,
  path: true,
  title: true,
  description: true,
  tags: true,
  editor: true,
  markdown: true,
  status: true,
  publishedAt: true,
} as const;

export type ArticleImportPlan = {
  parsed: ParsedArticleImportFile[];
  items: ArticleImportPlanItem[];
  summary: ArticleImportSummary;
};

export type AppliedArticleImportItem = {
  fileName: string;
  path: string | null;
  action: "created" | "updated" | "skipped" | "failed";
  error: string | null;
};

export type ArticleImportApplyResult = {
  items: AppliedArticleImportItem[];
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  affected: Array<{ id: string; path: string }>;
};

export async function planArticleImport(options: {
  files: ArticleImportSourceFile[];
  prefix?: string;
  defaultStatus: ArticleStatus;
  now?: () => Date;
}): Promise<ArticleImportPlan> {
  validateArticleImportBatch(
    options.files.map((file) => ({
      name: file.name,
      size: file.size,
    })),
  );

  const parsed = parseArticleImportFiles(options.files, {
    prefix: options.prefix,
  });
  const existing = await findExistingArticles(parsed);
  const items = buildArticleImportPlan(parsed, existing, {
    defaultStatus: options.defaultStatus,
    now: options.now,
  });

  return {
    parsed,
    items,
    summary: summarizeArticleImportPlan(items),
  };
}

/**
 * Applies a previously previewed batch. Files are parsed again by the caller
 * and article state is re-read here, so a stale preview can never resurrect a
 * deleted article or skip a newer edit.
 */
export async function applyArticleImport(options: {
  parsed: ParsedArticleImportFile[];
  selectedPaths: string[];
  defaultStatus: ArticleStatus;
  authorId: string;
  now?: () => Date;
}): Promise<ArticleImportApplyResult> {
  const selected = new Set(options.selectedPaths);
  const existingByPath = await findExistingArticles(options.parsed);
  const plan = buildArticleImportPlan(options.parsed, existingByPath, {
    defaultStatus: options.defaultStatus,
    now: options.now,
  });
  const parsedByPath = new Map<string, ParsedArticleImportFile>();

  for (const item of options.parsed) {
    if (item.article && !item.error) {
      parsedByPath.set(item.article.path, item);
    }
  }
  const result: ArticleImportApplyResult = {
    items: [],
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    affected: [],
  };

  for (const item of plan) {
    const path = item.path;

    if (path === null || !selected.has(path)) {
      continue;
    }

    const parsed = parsedByPath.get(path);

    if (item.action === "error" || !parsed?.article) {
      result.failed += 1;
      result.items.push({
        fileName: item.fileName,
        path,
        action: "failed",
        error: item.error ?? "This file could not be parsed.",
      });
      continue;
    }

    if (item.action === "unchanged") {
      result.skipped += 1;
      result.items.push({
        fileName: item.fileName,
        path,
        action: "skipped",
        error: null,
      });
      continue;
    }

    const existing = existingByPath.get(path) ?? null;
    const status = parsed.article.statusOverride ?? options.defaultStatus;
    const publishedAt = resolveImportPublishedAt(
      status,
      existing?.publishedAt ?? null,
      parsed.article.publishedAtOverride,
      options.now ?? (() => new Date()),
    );
    const data = {
      title: parsed.article.title,
      description: parsed.article.description,
      tags: parsed.article.tags,
      editor: parsed.article.editor,
      markdown: parsed.article.markdown,
      status,
      publishedAt,
    };

    try {
      const saved = await prisma.$transaction(async (tx) => {
        const article = existing
          ? await tx.article.update({
              where: { id: existing.id },
              data,
            })
          : await tx.article.create({
              data: {
                ...data,
                path,
                authorId: options.authorId,
              },
            });

        await snapshotArticleRevision(tx, article, options.authorId, {
          force: !existing,
        });
        await syncArticleMediaReferences(tx, article.id, article.markdown);
        await tx.log.create({
          data: {
            action: existing
              ? LogAction.UPDATE_ARTICLE
              : LogAction.CREATE_ARTICLE,
            targetType: "Article",
            targetId: article.id,
            detail: JSON.stringify({
              title: article.title,
              path: article.path,
              status: article.status,
              source: "markdown-import",
            }),
            userId: options.authorId,
          },
        });

        return article;
      });

      try {
        await enqueueArticleEmbeddingSync({
          articleId: saved.id,
          updatedAt: saved.updatedAt.toISOString(),
        });
      } catch (queueError) {
        console.error(
          "[articles] failed to enqueue embedding sync after import",
          queueError,
        );
      }

      if (existing) {
        result.updated += 1;
      } else {
        result.created += 1;
      }

      result.items.push({
        fileName: item.fileName,
        path,
        action: existing ? "updated" : "created",
        error: null,
      });
      result.affected.push({ id: saved.id, path: saved.path });
    } catch (error) {
      result.failed += 1;
      result.items.push({
        fileName: item.fileName,
        path,
        action: "failed",
        error: getImportErrorMessage(error),
      });
    }
  }

  return result;
}

async function findExistingArticles(parsed: ParsedArticleImportFile[]) {
  const paths = Array.from(
    new Set(
      parsed
        .map((item) => item.article?.path)
        .filter((path): path is string => typeof path === "string"),
    ),
  );
  const existing = paths.length
    ? await prisma.article.findMany({
        where: { path: { in: paths } },
        select: existingArticleSelect,
      })
    : [];

  return new Map(existing.map((article) => [article.path, article]));
}

function getImportErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return "An article already exists at this path.";
  }

  return error instanceof Error ? error.message : String(error);
}
