import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ArticleStatus } from "@/generated/prisma/enums";
import { canonicalizePath } from "@/lib/wiki-path";

const markdownExtension = ".md";
const defaultRootEmail = "root@luckywiki.local";
const headingPattern = /^#\s+(.+?)\s*$/m;

export type ImportArticle = {
  path: string;
  title: string;
  markdown: string;
  relativeFilePath: string;
  absoluteFilePath?: string;
};

export type ExistingImportArticle = {
  id: string;
  title: string;
  markdown: string;
  status: ArticleStatus;
  publishedAt: Date | null;
};

export type CreateImportArticleInput = {
  path: string;
  title: string;
  markdown: string;
  status: ArticleStatus;
  authorId: string;
  publishedAt: Date | null;
};

export type UpdateImportArticleInput = {
  title: string;
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
      authorEmail = readRequiredFlagValue("--author-email", arg.slice("--author-email=".length));
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
    throw new Error("Usage: npm run articles:import -- <dir> [--dry-run] [--author-email=<email>] [--status=draft|published]");
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

  const articles = await loadArticlesFromDirectory(directory);
  const summary: ImportArticlesSummary = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    total: articles.length,
  };

  logger.info(
    `Scanning ${articles.length} markdown file${articles.length === 1 ? "" : "s"} in ${path.resolve(directory)}`,
  );

  for (const article of articles) {
    try {
      const existing = await repo.findArticleByPath(article.path);

      if (!existing) {
        const createInput: CreateImportArticleInput = {
          path: article.path,
          title: article.title,
          markdown: article.markdown,
          status,
          authorId: author.id,
          publishedAt: resolvePublishedAt(status, null, now),
        };

        if (!dryRun) {
          await repo.createArticle(createInput);
        }

        summary.created += 1;
        logger.info(`${dryRun ? "[dry-run] " : ""}create ${article.relativeFilePath} -> ${formatArticlePath(article.path)}`);
        continue;
      }

      const updateInput: UpdateImportArticleInput = {
        title: article.title,
        markdown: article.markdown,
        status,
        publishedAt: resolvePublishedAt(status, existing.publishedAt, now),
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
      logger.info(`${dryRun ? "[dry-run] " : ""}update ${article.relativeFilePath} -> ${formatArticlePath(article.path)}`);
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error?.(`failed ${article.relativeFilePath}: ${message}`);
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
  const articles = await Promise.all(
    files.map(async (absoluteFilePath) => {
      const relativeFilePath = path.relative(absoluteDirectory, absoluteFilePath).split(path.sep).join("/");
      const markdown = await readFile(absoluteFilePath, "utf8");

      return resolveImportArticle(relativeFilePath, markdown, absoluteFilePath);
    }),
  );

  return articles.sort((left, right) => left.relativeFilePath.localeCompare(right.relativeFilePath));
}

export function resolveImportArticle(
  relativeFilePath: string,
  markdown: string,
  absoluteFilePath?: string,
): ImportArticle {
  const articlePath = mapRelativeFileToArticlePath(relativeFilePath);
  const { title, markdown: cleanedMarkdown } = extractArticleTitleAndMarkdown(markdown, articlePath);

  return {
    path: articlePath,
    title,
    markdown: cleanedMarkdown,
    relativeFilePath: relativeFilePath.split(path.sep).join("/"),
    absoluteFilePath,
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
  const normalizedMarkdown = stripByteOrderMark(markdown);
  const headingMatch = normalizedMarkdown.match(headingPattern);

  if (!headingMatch) {
    return {
      title: fallbackTitleForPath(fallbackPath),
      markdown: normalizedMarkdown,
    };
  }

  const rawTitle = headingMatch[1]?.trim() ?? "";
  const title = rawTitle.replace(/\s+#+\s*$/u, "") || fallbackTitleForPath(fallbackPath);

  return {
    title,
    markdown: removeFirstHeading(normalizedMarkdown, headingMatch),
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

function resolvePublishedAt(
  status: ArticleStatus,
  existingPublishedAt: Date | null,
  now: () => Date,
) {
  if (status === ArticleStatus.DRAFT) {
    return null;
  }

  return existingPublishedAt ?? now();
}

function isArticleUpToDate(existing: ExistingImportArticle, next: UpdateImportArticleInput) {
  return (
    existing.title === next.title &&
    existing.markdown === next.markdown &&
    existing.status === next.status &&
    samePublishedAt(existing.publishedAt, next.publishedAt)
  );
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
