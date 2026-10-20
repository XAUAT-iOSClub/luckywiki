import { ArticleStatus } from "@/generated/prisma/enums";
import {
  isArticleUpToDate,
  mapRelativeFileToArticlePath,
  resolveImportArticle,
  resolveImportPublishedAt,
  type ExistingImportArticle,
  type ImportArticle,
} from "@/lib/articles/import";
import { canonicalizePath, isReservedWikiPath } from "@/lib/wiki/path";
import {
  ARTICLE_IMPORT_MAX_FILE_BYTES,
  ARTICLE_IMPORT_MAX_FILES,
  ARTICLE_IMPORT_MAX_PREFIX_LENGTH,
  ARTICLE_IMPORT_MAX_TOTAL_BYTES,
} from "@/lib/articles/import-constants";

export {
  ARTICLE_IMPORT_MAX_FILE_BYTES,
  ARTICLE_IMPORT_MAX_FILES,
  ARTICLE_IMPORT_MAX_PREFIX_LENGTH,
  ARTICLE_IMPORT_MAX_TOTAL_BYTES,
} from "@/lib/articles/import-constants";

export type ArticleImportSourceFile = {
  name: string;
  content: string;
  size?: number;
};

export type ParsedArticleImportFile = {
  fileName: string;
  relativePath: string;
  path: string | null;
  article: ImportArticle | null;
  error: string | null;
};

export type ArticleImportAction = "create" | "update" | "unchanged" | "error";

export type ArticleImportPlanItem = {
  fileName: string;
  relativePath: string;
  path: string | null;
  title: string | null;
  description: string | null;
  tags: string[];
  editor: string | null;
  status: ArticleStatus;
  publishedAt: string | null;
  action: ArticleImportAction;
  warnings: string[];
  error: string | null;
  existingId: string | null;
};

export type ArticleImportSummary = {
  create: number;
  update: number;
  unchanged: number;
  error: number;
  total: number;
};

export class ArticleImportValidationError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "ArticleImportValidationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Validates the batch itself (count and size). Per-file problems such as an
 * unsupported extension or broken frontmatter are reported per item instead,
 * so one bad file does not block the rest of the upload.
 */
export function validateArticleImportBatch(
  files: Array<Pick<ArticleImportSourceFile, "name" | "size">>,
) {
  if (files.length === 0) {
    throw new ArticleImportValidationError(
      "NO_FILES",
      "Select at least one Markdown file to import.",
    );
  }

  if (files.length > ARTICLE_IMPORT_MAX_FILES) {
    throw new ArticleImportValidationError(
      "TOO_MANY_FILES",
      `A maximum of ${ARTICLE_IMPORT_MAX_FILES} files can be imported at once.`,
      413,
    );
  }

  let totalBytes = 0;

  for (const file of files) {
    const size = file.size ?? 0;

    if (size > ARTICLE_IMPORT_MAX_FILE_BYTES) {
      throw new ArticleImportValidationError(
        "FILE_TOO_LARGE",
        `"${file.name}" exceeds the ${formatBytes(ARTICLE_IMPORT_MAX_FILE_BYTES)} limit.`,
        413,
        { fileName: file.name },
      );
    }

    totalBytes += size;
  }

  if (totalBytes > ARTICLE_IMPORT_MAX_TOTAL_BYTES) {
    throw new ArticleImportValidationError(
      "TOTAL_TOO_LARGE",
      `The upload exceeds the ${formatBytes(ARTICLE_IMPORT_MAX_TOTAL_BYTES)} total limit.`,
      413,
    );
  }
}

export function normalizeArticleImportPrefix(input: string) {
  const trimmed = input.trim();

  if (!trimmed) {
    return "";
  }

  if (trimmed.length > ARTICLE_IMPORT_MAX_PREFIX_LENGTH) {
    throw new ArticleImportValidationError(
      "INVALID_PREFIX",
      `The path prefix cannot exceed ${ARTICLE_IMPORT_MAX_PREFIX_LENGTH} characters.`,
    );
  }

  let canonical: string;

  try {
    const segments = trimmed
      .replaceAll("\\", "/")
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (segments.length === 0) {
      return "";
    }

    canonical = canonicalizePath(segments.join("/"));
  } catch (error) {
    throw new ArticleImportValidationError(
      "INVALID_PREFIX",
      error instanceof Error ? error.message : "Invalid path prefix.",
    );
  }

  if (isReservedWikiPath(canonical)) {
    throw new ArticleImportValidationError(
      "INVALID_PREFIX",
      `"${canonical}" is reserved for taxonomy pages and cannot hold articles.`,
    );
  }

  return canonical;
}

export function parseArticleImportFiles(
  files: ArticleImportSourceFile[],
  options?: { prefix?: string },
): ParsedArticleImportFile[] {
  const prefix = normalizeArticleImportPrefix(options?.prefix ?? "");
  const parsed = files.map((file) => {
    const fileName = getBaseFileName(file.name);

    if (!fileName) {
      return errorItem(file.name, "", "The file name is empty.");
    }

    if (!fileName.toLowerCase().endsWith(".md")) {
      return errorItem(fileName, fileName, "Only .md files can be imported.");
    }

    const baseName = fileName.slice(0, -3).trim();

    if (!baseName) {
      return errorItem(
        fileName,
        fileName,
        "The file name must include a name before the .md extension.",
      );
    }

    const normalizedFileName = `${baseName}.md`;
    const relativePath = prefix
      ? `${prefix}/${normalizedFileName}`
      : normalizedFileName;

    try {
      const path = mapRelativeFileToArticlePath(relativePath);

      if (isReservedWikiPath(path)) {
        throw new Error(
          `"${path}" is reserved for taxonomy pages and cannot hold articles.`,
        );
      }

      const article = resolveImportArticle(relativePath, file.content);

      return {
        fileName,
        relativePath,
        path,
        article,
        error: null,
      } satisfies ParsedArticleImportFile;
    } catch (error) {
      return errorItem(
        fileName,
        relativePath,
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  return markDuplicatePaths(parsed);
}

export function buildArticleImportPlan(
  parsed: ParsedArticleImportFile[],
  existingByPath: ReadonlyMap<string, ExistingImportArticle>,
  options?: { defaultStatus?: ArticleStatus; now?: () => Date },
): ArticleImportPlanItem[] {
  const defaultStatus = options?.defaultStatus ?? ArticleStatus.PUBLISHED;
  const now = options?.now ?? (() => new Date());

  return parsed.map((item) => {
    if (!item.article || item.error) {
      return {
        fileName: item.fileName,
        relativePath: item.relativePath,
        path: item.path,
        title: null,
        description: null,
        tags: [],
        editor: null,
        status: defaultStatus,
        publishedAt: null,
        action: "error",
        warnings: [],
        error: item.error ?? "This file could not be parsed.",
        existingId: null,
      };
    }

    const { article } = item;
    const status = article.statusOverride ?? defaultStatus;
    const existing = existingByPath.get(article.path) ?? null;
    const publishedAt = resolveImportPublishedAt(
      status,
      existing?.publishedAt ?? null,
      article.publishedAtOverride,
      now,
    );
    const next = {
      title: article.title,
      description: article.description,
      tags: article.tags,
      editor: article.editor,
      markdown: article.markdown,
      status,
      publishedAt,
    };
    const action: ArticleImportAction = !existing
      ? "create"
      : isArticleUpToDate(existing, next)
        ? "unchanged"
        : "update";

    return {
      fileName: item.fileName,
      relativePath: item.relativePath,
      path: article.path,
      title: article.title,
      description: article.description,
      tags: article.tags,
      editor: article.editor,
      status,
      publishedAt: publishedAt?.toISOString() ?? null,
      action,
      warnings: article.warnings,
      error: null,
      existingId: existing?.id ?? null,
    };
  });
}

export function summarizeArticleImportPlan(
  items: ArticleImportPlanItem[],
): ArticleImportSummary {
  return items.reduce<ArticleImportSummary>(
    (summary, item) => {
      summary[item.action] += 1;
      summary.total += 1;
      return summary;
    },
    { create: 0, update: 0, unchanged: 0, error: 0, total: 0 },
  );
}

function errorItem(
  fileName: string,
  relativePath: string,
  error: string,
): ParsedArticleImportFile {
  return {
    fileName,
    relativePath,
    path: null,
    article: null,
    error,
  };
}

function markDuplicatePaths(parsed: ParsedArticleImportFile[]) {
  const indexesByPath = new Map<string, number[]>();

  parsed.forEach((item, index) => {
    if (item.path === null) {
      return;
    }

    const indexes = indexesByPath.get(item.path) ?? [];
    indexes.push(index);
    indexesByPath.set(item.path, indexes);
  });

  for (const [path, indexes] of indexesByPath) {
    if (indexes.length < 2) {
      continue;
    }

    for (const index of indexes) {
      parsed[index] = {
        ...parsed[index],
        article: null,
        error: `Multiple uploaded files map to the same article path "${path}".`,
      };
    }
  }

  return parsed;
}

function getBaseFileName(input: string) {
  const normalized = input.replaceAll("\\", "/");
  return normalized.split("/").filter(Boolean).at(-1) ?? "";
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}
