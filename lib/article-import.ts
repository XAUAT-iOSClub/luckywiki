import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { ArticleStatus } from "@/generated/prisma/enums";
import { canonicalizePath } from "@/lib/wiki-path";

const markdownExtension = ".md";
const defaultRootEmail = "root@luckywiki.local";
const headingPattern = /^#\s+(.+?)\s*$/m;
const supportedFrontmatterKeys = new Set([
  "title",
  "description",
  "published",
  "date",
  "tags",
  "editor",
  "dateCreated",
]);

type ParsedFrontmatter = {
  title?: string;
  description: string | null;
  tags: string[];
  editor: string | null;
  statusOverride?: ArticleStatus;
  publishedAtOverride?: Date;
  warnings: string[];
};

export type ImportArticle = {
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  editor: string | null;
  markdown: string;
  relativeFilePath: string;
  absoluteFilePath?: string;
  statusOverride?: ArticleStatus;
  publishedAtOverride?: Date;
  warnings: string[];
};

export type ExistingImportArticle = {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  editor: string | null;
  markdown: string;
  status: ArticleStatus;
  publishedAt: Date | null;
};

export type CreateImportArticleInput = {
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  editor: string | null;
  markdown: string;
  status: ArticleStatus;
  authorId: string;
  publishedAt: Date | null;
};

export type UpdateImportArticleInput = {
  title: string;
  description: string | null;
  tags: string[];
  editor: string | null;
  markdown: string;
  status: ArticleStatus;
  publishedAt: Date | null;
};

export type ImportArticleRepository = {
  findUserByEmail(email: string): Promise<{ id: string; email: string } | null>;
  findArticleByPath(path: string): Promise<ExistingImportArticle | null>;
  createArticle(data: CreateImportArticleInput): Promise<void>;
  updateArticle(id: string, data: UpdateImportArticleInput): Promise<void>;
};

export type ImportArticleLogger = {
  info(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
};

export type ImportArticlesOptions = {
  directory: string;
  authorEmail: string;
  status: ArticleStatus;
  dryRun?: boolean;
  repo: ImportArticleRepository;
  logger?: ImportArticleLogger;
  now?: () => Date;
};

export type ImportArticlesSummary = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
};

export type ParsedImportCliArgs = {
  directory: string;
  authorEmail: string;
  status: ArticleStatus;
  dryRun: boolean;
};

export function getDefaultImportAuthorEmail(env: NodeJS.ProcessEnv = process.env) {
  return env.ROOT_EMAIL ?? defaultRootEmail;
}

export function parseImportCliArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ParsedImportCliArgs {
  let directory: string | undefined;
  let authorEmail = getDefaultImportAuthorEmail(env);
  let status: ArticleStatus = ArticleStatus.PUBLISHED;
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--author-email") {
      authorEmail = readRequiredFlagValue("--author-email", argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--author-email=")) {
      authorEmail = readRequiredFlagValue(
        "--author-email",
        arg.slice("--author-email=".length),
      );
      continue;
    }

    if (arg === "--status") {
      status = parseImportStatus(readRequiredFlagValue("--status", argv[index + 1]));
      index += 1;
      continue;
    }

    if (arg.startsWith("--status=")) {
      status = parseImportStatus(readRequiredFlagValue("--status", arg.slice("--status=".length)));
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (directory) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    directory = arg;
  }

  if (!directory) {
    throw new Error(
      "Usage: npm run articles:import -- <dir> [--dry-run] [--author-email=<email>] [--status=draft|published]",
    );
  }

  return {
    directory,
    authorEmail,
    status,
    dryRun,
  };
}

export async function importArticlesFromDirectory({
  directory,
  authorEmail,
  status,
  dryRun = false,
  repo,
  logger = console,
  now = () => new Date(),
}: ImportArticlesOptions): Promise<ImportArticlesSummary> {
  const author = await repo.findUserByEmail(authorEmail);

  if (!author) {
    throw new Error(`Author not found for email "${authorEmail}".`);
  }

  const absoluteDirectory = path.resolve(directory);
  const files = await collectMarkdownFiles(absoluteDirectory);
  const summary: ImportArticlesSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: files.length,
  };

  logger.info(
    `Scanning ${files.length} markdown file${files.length === 1 ? "" : "s"} in ${absoluteDirectory}`,
  );

  for (const absoluteFilePath of files) {
    const relativeFilePath = path
      .relative(absoluteDirectory, absoluteFilePath)
      .split(path.sep)
      .join("/");

    try {
      const markdown = await readFile(absoluteFilePath, "utf8");
      const article = resolveImportArticle(relativeFilePath, markdown, absoluteFilePath);

      for (const warning of article.warnings) {
        logger.warn?.(`warning ${article.relativeFilePath}: ${warning}`);
      }

      const existing = await repo.findArticleByPath(article.path);
      const resolvedStatus = article.statusOverride ?? status;

      if (!existing) {
        const createInput: CreateImportArticleInput = {
          path: article.path,
          title: article.title,
          description: article.description,
          tags: article.tags,
          editor: article.editor,
          markdown: article.markdown,
          status: resolvedStatus,
          authorId: author.id,
          publishedAt: resolvePublishedAt(
            resolvedStatus,
            null,
            article.publishedAtOverride,
            now,
          ),
        };

        if (!dryRun) {
          await repo.createArticle(createInput);
        }

        summary.created += 1;
        logger.info(
          `${dryRun ? "[dry-run] " : ""}create ${article.relativeFilePath} -> ${formatArticlePath(article.path)}`,
        );
        continue;
      }

      const updateInput: UpdateImportArticleInput = {
        title: article.title,
        description: article.description,
        tags: article.tags,
        editor: article.editor,
        markdown: article.markdown,
        status: resolvedStatus,
        publishedAt: resolvePublishedAt(
          resolvedStatus,
          existing.publishedAt,
          article.publishedAtOverride,
          now,
        ),
      };

      if (isArticleUpToDate(existing, updateInput)) {
        summary.skipped += 1;
        logger.info(`skip ${article.relativeFilePath} -> ${formatArticlePath(article.path)}`);
        continue;
      }

      if (!dryRun) {
        await repo.updateArticle(existing.id, updateInput);
      }

      summary.updated += 1;
      logger.info(
        `${dryRun ? "[dry-run] " : ""}update ${article.relativeFilePath} -> ${formatArticlePath(article.path)}`,
      );
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error?.(`failed ${relativeFilePath}: ${message}`);
    }
  }

  logger.info(
    `Import summary: created=${summary.created} updated=${summary.updated} skipped=${summary.skipped} failed=${summary.failed} total=${summary.total}`,
  );

  return summary;
}

export async function loadArticlesFromDirectory(directory: string): Promise<ImportArticle[]> {
  const absoluteDirectory = path.resolve(directory);
  const files = await collectMarkdownFiles(absoluteDirectory);

  return Promise.all(
    files.map(async (absoluteFilePath) => {
      const relativeFilePath = path
        .relative(absoluteDirectory, absoluteFilePath)
        .split(path.sep)
        .join("/");
      const markdown = await readFile(absoluteFilePath, "utf8");

      return resolveImportArticle(relativeFilePath, markdown, absoluteFilePath);
    }),
  );
}

export function resolveImportArticle(
  relativeFilePath: string,
  markdown: string,
  absoluteFilePath?: string,
): ImportArticle {
  const articlePath = mapRelativeFileToArticlePath(relativeFilePath);
  const normalizedMarkdown = stripByteOrderMark(markdown);
  const { data, content } = matter(normalizedMarkdown);
  const frontmatter = parseFrontmatter(data, relativeFilePath);
  const body = extractFirstHeading(content);
  const title =
    frontmatter.title ?? body.headingTitle ?? fallbackTitleForPath(articlePath);

  return {
    path: articlePath,
    title,
    description: frontmatter.description,
    tags: frontmatter.tags,
    editor: frontmatter.editor,
    markdown: body.markdown,
    relativeFilePath: relativeFilePath.split(path.sep).join("/"),
    absoluteFilePath,
    statusOverride: frontmatter.statusOverride,
    publishedAtOverride: frontmatter.publishedAtOverride,
    warnings: frontmatter.warnings,
  };
}

export function mapRelativeFileToArticlePath(relativeFilePath: string) {
  const normalizedPath = relativeFilePath.split(path.sep).join("/");

  if (!normalizedPath.endsWith(markdownExtension)) {
    throw new Error(`Unsupported article file: ${relativeFilePath}`);
  }

  const withoutExtension = normalizedPath.slice(0, -markdownExtension.length);
  const segments = withoutExtension.split("/");
  const fileName = segments.at(-1) ?? "";
  const pathCandidate =
    fileName.toLowerCase() === "index" ? segments.slice(0, -1).join("/") : withoutExtension;

  return canonicalizePath(pathCandidate);
}

export function extractArticleTitleAndMarkdown(markdown: string, fallbackPath: string) {
  const { headingTitle, markdown: cleanedMarkdown } = extractFirstHeading(
    stripByteOrderMark(markdown),
  );

  return {
    title: headingTitle ?? fallbackTitleForPath(fallbackPath),
    markdown: cleanedMarkdown,
  };
}

export function fallbackTitleForPath(pathValue: string) {
  if (!pathValue) {
    return "Home";
  }

  const lastSegment = pathValue.split("/").at(-1) ?? "";
  return lastSegment
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseFrontmatter(source: unknown, relativeFilePath: string): ParsedFrontmatter {
  if (!source || Array.isArray(source) || typeof source !== "object") {
    throw new Error(`Invalid frontmatter object in ${relativeFilePath}.`);
  }

  const data = source as Record<string, unknown>;
  const warnings: string[] = [];

  for (const key of Object.keys(data)) {
    if (!supportedFrontmatterKeys.has(key)) {
      warnings.push(`Ignoring unsupported frontmatter field "${key}".`);
    }
  }

  const title = parseOptionalNonEmptyString(data.title, "title");
  const description = parseNullableString(data.description, "description");
  const editor = parseNullableString(data.editor, "editor");
  const tags = parseTags(data.tags);
  const statusOverride = parsePublishedStatus(data.published);
  const publishedAtOverride = parseOptionalDate(data.date, "date");

  return {
    title,
    description,
    editor,
    tags,
    statusOverride,
    publishedAtOverride,
    warnings,
  };
}

function parseOptionalNonEmptyString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`Frontmatter field "${fieldName}" must be a string.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Frontmatter field "${fieldName}" cannot be empty.`);
  }

  return normalized;
}

function parseNullableString(value: unknown, fieldName: string) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Frontmatter field "${fieldName}" must be a string.`);
  }

  const normalized = value.trim();
  return normalized || null;
}

function parseTags(value: unknown) {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (!Array.isArray(value)) {
    throw new Error('Frontmatter field "tags" must be a string or a string array.');
  }

  return value.map((tag, index) => {
    if (typeof tag !== "string") {
      throw new Error(
        `Frontmatter field "tags" entry at index ${index} must be a string.`,
      );
    }

    const normalized = tag.trim();

    if (!normalized) {
      throw new Error(
        `Frontmatter field "tags" entry at index ${index} cannot be empty.`,
      );
    }

    return normalized;
  });
}

function parsePublishedStatus(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw new Error('Frontmatter field "published" must be a boolean.');
  }

  return value ? ArticleStatus.PUBLISHED : ArticleStatus.DRAFT;
}

function parseOptionalDate(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error(`Frontmatter field "${fieldName}" must be a valid date.`);
    }

    return value;
  }

  if (typeof value !== "string") {
    throw new Error(`Frontmatter field "${fieldName}" must be a string or date.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`Frontmatter field "${fieldName}" cannot be empty.`);
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Frontmatter field "${fieldName}" must be a valid date.`);
  }

  return parsed;
}

function extractFirstHeading(markdown: string) {
  const headingMatch = markdown.match(headingPattern);

  if (!headingMatch) {
    return {
      headingTitle: null,
      markdown,
    };
  }

  const rawTitle = headingMatch[1]?.trim() ?? "";
  const headingTitle = rawTitle.replace(/\s+#+\s*$/u, "") || null;

  return {
    headingTitle,
    markdown: removeFirstHeading(markdown, headingMatch),
  };
}

function resolvePublishedAt(
  status: ArticleStatus,
  existingPublishedAt: Date | null,
  frontmatterPublishedAt: Date | undefined,
  now: () => Date,
) {
  if (status === ArticleStatus.DRAFT) {
    return null;
  }

  return frontmatterPublishedAt ?? existingPublishedAt ?? now();
}

function isArticleUpToDate(existing: ExistingImportArticle, next: UpdateImportArticleInput) {
  return (
    existing.title === next.title &&
    existing.description === next.description &&
    existing.editor === next.editor &&
    sameTags(existing.tags, next.tags) &&
    existing.markdown === next.markdown &&
    existing.status === next.status &&
    samePublishedAt(existing.publishedAt, next.publishedAt)
  );
}

function sameTags(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((tag, index) => tag === right[index]);
}

function samePublishedAt(left: Date | null, right: Date | null) {
  if (!left && !right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return left.getTime() === right.getTime();
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(markdownExtension)) {
      files.push(entryPath);
    }
  }

  return files;
}

function stripByteOrderMark(markdown: string) {
  return markdown.replace(/^\uFEFF/u, "");
}

function removeFirstHeading(markdown: string, headingMatch: RegExpMatchArray) {
  const start = headingMatch.index ?? 0;
  const headingText = headingMatch[0];
  const end = start + headingText.length;
  const before = markdown.slice(0, start);
  let after = markdown.slice(end);

  after = after.replace(/^\r?\n(?:[ \t]*\r?\n)*/u, "");

  if (!before) {
    return after;
  }

  if (!after) {
    return before.replace(/\r?\n$/u, "");
  }

  return `${before}${before.endsWith("\n") ? "" : "\n"}${after}`;
}

function parseImportStatus(value: string): ArticleStatus {
  const normalized = value.trim().toLowerCase();

  if (normalized === "draft") {
    return ArticleStatus.DRAFT;
  }

  if (normalized === "published") {
    return ArticleStatus.PUBLISHED;
  }

  throw new Error(`Invalid status "${value}". Use draft or published.`);
}

function readRequiredFlagValue(flag: string, value: string | undefined) {
  if (!value?.trim()) {
    throw new Error(`Missing value for ${flag}.`);
  }

  return value.trim();
}

function formatArticlePath(pathValue: string) {
  return pathValue || "(root)";
}
