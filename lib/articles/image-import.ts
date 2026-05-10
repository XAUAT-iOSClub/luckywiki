import { File } from "node:buffer";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { visit } from "unist-util-visit";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import sharp from "sharp";
import {
  getMaxImageUploadBytes,
  uploadImageFile,
} from "@/lib/image-hosting";

const markdownExtension = ".md";
const defaultRootDirectoryName = "articles";
const remoteImageUrlPattern = /^(?:[a-zA-Z][a-zA-Z\d+.-]*:|\/\/)/u;
const webpQuality = 82;
const webpEffort = 4;

type UploadResult = {
  key: string;
  url: string;
};

type MarkdownImageNode = {
  alt?: string | null;
  position?: {
    end?: { offset?: number };
    start?: { offset?: number };
  };
  title?: string | null;
  type: "image";
  url?: string | null;
};

type ImageRewriteReplacement = {
  end: number;
  replacement: string;
  start: number;
};

export type ArticleImageImportLogger = {
  info(message: string): void;
  warn?(message: string): void;
  error?(message: string): void;
};

export type ArticleImageImportSummary = {
  changed: number;
  failed: number;
  imagesUploaded: number;
  scanned: number;
  skipped: number;
  total: number;
};

export type RewriteArticleImagesOptions = {
  articlesRootDirectory: string;
  dryRun?: boolean;
  markdown: string;
  markdownFilePath: string;
  sharedUploadCache?: Map<string, string>;
  uploadLocalImage?: (file: File, absolutePath: string) => Promise<UploadResult>;
};

export type ProcessArticleImagesOptions = {
  articlesRootDirectory?: string;
  directory: string;
  dryRun?: boolean;
  logger?: ArticleImageImportLogger;
  uploadLocalImage?: (file: File, absolutePath: string) => Promise<UploadResult>;
};

const markdownParser = unified().use(remarkParse).use(remarkGfm);

export function parseArticleImageImportCliArgs(
  argv: string[],
): {
  directory: string;
  dryRun: boolean;
} {
  let directory: string | undefined;
  let dryRun = false;

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
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
      "Usage: npm run articles:import-images -- <dir> [--dry-run]",
    );
  }

  return { directory, dryRun };
}

export async function importArticleImagesFromDirectory({
  articlesRootDirectory,
  directory,
  dryRun = false,
  logger = console,
  uploadLocalImage = defaultUploadLocalImage,
}: ProcessArticleImagesOptions): Promise<ArticleImageImportSummary> {
  const absoluteDirectory = path.resolve(directory);
  const resolvedArticlesRootDirectory =
    path.resolve(articlesRootDirectory ?? inferArticlesRootDirectory(absoluteDirectory));
  const files = (await collectMarkdownFiles(absoluteDirectory)).sort((left, right) =>
    left.localeCompare(right),
  );
  const sharedUploadCache = new Map<string, string>();
  const summary: ArticleImageImportSummary = {
    changed: 0,
    failed: 0,
    imagesUploaded: 0,
    scanned: files.length,
    skipped: 0,
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
      const result = await rewriteMarkdownImages({
        articlesRootDirectory: resolvedArticlesRootDirectory,
        dryRun,
        markdown,
        markdownFilePath: absoluteFilePath,
        sharedUploadCache,
        uploadLocalImage,
      });

      if (!result.changed) {
        summary.skipped += 1;
        logger.info(`skip ${relativeFilePath}`);
        continue;
      }

      summary.changed += 1;
      summary.imagesUploaded += result.imagesUploaded;

      if (!dryRun) {
        await writeFile(absoluteFilePath, result.markdown);
      }

      logger.info(
        `${dryRun ? "[dry-run] " : ""}rewrite ${relativeFilePath} (${result.imagesUploaded} local image${result.imagesUploaded === 1 ? "" : "s"})`,
      );
    } catch (error) {
      summary.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      logger.error?.(`failed ${relativeFilePath}: ${message}`);
    }
  }

  logger.info(
    `Image import summary: changed=${summary.changed} skipped=${summary.skipped} failed=${summary.failed} uploaded=${summary.imagesUploaded} total=${summary.total}`,
  );

  return summary;
}

export async function rewriteMarkdownImages({
  articlesRootDirectory,
  dryRun = false,
  markdown,
  markdownFilePath,
  sharedUploadCache = new Map<string, string>(),
  uploadLocalImage = defaultUploadLocalImage,
}: RewriteArticleImagesOptions): Promise<{
  changed: boolean;
  imagesUploaded: number;
  markdown: string;
}> {
  const tree = markdownParser.parse(markdown);
  const imageNodes: MarkdownImageNode[] = [];

  visit(tree, "image", (node: unknown) => {
    const imageNode = node as MarkdownImageNode;

    if (typeof imageNode.url !== "string" || !isLocalImageUrl(imageNode.url)) {
      return;
    }

    imageNodes.push(imageNode);
  });

  if (!imageNodes.length) {
    return {
      changed: false,
      imagesUploaded: 0,
      markdown,
    };
  }

  const replacements: ImageRewriteReplacement[] = [];
  let imagesUploaded = 0;

  for (const imageNode of imageNodes) {
    const sourceUrl = imageNode.url ?? "";
    const absolutePath = resolveLocalImagePath({
      articlesRootDirectory,
      markdownFilePath,
      sourceUrl,
    });
    const replacementStart = imageNode.position?.start?.offset;
    const replacementEnd = imageNode.position?.end?.offset;

    if (typeof replacementStart !== "number" || typeof replacementEnd !== "number") {
      throw new Error(`Cannot determine image position in ${markdownFilePath}.`);
    }

    const cachedUploadUrl = sharedUploadCache.get(absolutePath);
    let rewrittenUrl = cachedUploadUrl;

    if (!rewrittenUrl) {
      if (dryRun) {
        await validateLocalImageForDryRun(absolutePath);
      } else {
        const uploaded = await uploadAndCacheLocalImage(
          absolutePath,
          uploadLocalImage,
          sharedUploadCache,
        );
        rewrittenUrl = uploaded.url;
        imagesUploaded += 1;
      }
    }

    if (!dryRun && rewrittenUrl) {
      replacements.push({
        end: replacementEnd,
        replacement: renderMarkdownImage(imageNode, rewrittenUrl),
        start: replacementStart,
      });
    }
  }

  if (dryRun) {
    return {
      changed: true,
      imagesUploaded: 0,
      markdown,
    };
  }

  const updatedMarkdown = applyTextReplacements(markdown, replacements);

  return {
    changed: updatedMarkdown !== markdown,
    imagesUploaded,
    markdown: updatedMarkdown,
  };
}

export function inferArticlesRootDirectory(directory: string) {
  const absoluteDirectory = path.resolve(directory);
  const segments = absoluteDirectory.split(path.sep);
  const rootIndex = segments.lastIndexOf(defaultRootDirectoryName);

  if (rootIndex === -1) {
    return absoluteDirectory;
  }

  return segments.slice(0, rootIndex + 1).join(path.sep) || path.sep;
}

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(markdownExtension)) {
      files.push(entryPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function isLocalImageUrl(url: string) {
  return !remoteImageUrlPattern.test(url) && !url.startsWith("#");
}

function resolveLocalImagePath({
  articlesRootDirectory,
  markdownFilePath,
  sourceUrl,
}: {
  articlesRootDirectory: string;
  markdownFilePath: string;
  sourceUrl: string;
}) {
  if (sourceUrl.startsWith("/")) {
    return path.join(articlesRootDirectory, sourceUrl);
  }

  return path.resolve(path.dirname(markdownFilePath), sourceUrl);
}

async function uploadAndCacheLocalImage(
  absolutePath: string,
  uploadLocalImage: (file: File, absolutePath: string) => Promise<UploadResult>,
  sharedUploadCache: Map<string, string>,
) {
  const file = await prepareLocalImageFileForUpload(absolutePath);
  const uploaded = await uploadLocalImage(file, absolutePath);
  sharedUploadCache.set(absolutePath, uploaded.url);
  return uploaded;
}

async function validateLocalImageForDryRun(absolutePath: string) {
  await prepareLocalImageFileForUpload(absolutePath);
}

export async function prepareLocalImageFileForUpload(absolutePath: string) {
  const sourceBuffer = await readFile(absolutePath);
  const outputFileName = `${path.basename(absolutePath, path.extname(absolutePath))}.webp`;
  const image = sharp(sourceBuffer, { animated: true }).webp({
    effort: webpEffort,
    quality: webpQuality,
  });
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  const maxUploadBytes = getMaxImageUploadBytes();

  if (info.size > maxUploadBytes) {
    throw new Error(`Image exceeds the ${maxUploadBytes} byte upload limit after WebP compression: ${absolutePath}`);
  }

  return new File([data], outputFileName, { type: "image/webp" });
}

function renderMarkdownImage(node: MarkdownImageNode, url: string) {
  const altText = escapeMarkdownImageAltText(node.alt ?? "");
  const titleText = node.title ? ` ${formatMarkdownImageTitle(node.title)}` : "";

  return `![${altText}](${url}${titleText})`;
}

function escapeMarkdownImageAltText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function formatMarkdownImageTitle(title: string) {
  if (!title.includes('"')) {
    return `"${title.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
  }

  if (!title.includes("'")) {
    return `'${title.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  }

  const escaped = title.replaceAll("\\", "\\\\").replaceAll(")", "\\)").replaceAll("(", "\\(");
  return `(${escaped})`;
}

function applyTextReplacements(text: string, replacements: ImageRewriteReplacement[]) {
  let result = text;

  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    result = `${result.slice(0, replacement.start)}${replacement.replacement}${result.slice(replacement.end)}`;
  }

  return result;
}

async function defaultUploadLocalImage(file: File) {
  return uploadImageFile(file);
}
