import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export type MigrationLogger = {
  info(message: string): void;
  warn?(message: string): void;
};

export type MigrationFileResult = {
  sourcePath: string;
  outputPath: string;
  changed: boolean;
  deletedHtmlSource: boolean;
  warnings: string[];
};

export type MigrationSummary = {
  markdownFiles: number;
  htmlFiles: number;
  writtenFiles: number;
  deletedHtmlFiles: number;
  warnings: number;
  results: MigrationFileResult[];
};

type MigrateContext = {
  absolutePath?: string;
  assetIndex?: AssetIndex;
  warnings: string[];
};

type AssetIndex = {
  bySuffix: Map<string, string[]>;
  articleRoot: string;
};

type SplitFrontmatterResult = {
  body: string;
  frontmatter: string;
};

type HtmlTableCell = {
  colspan: number;
  rowspan: number;
  text: string;
};

const markdownExtensions = new Set([".md", ".html"]);
const alertTypeMap: Record<string, string> = {
  danger: "IMPORTANT",
  info: "TIP",
  success: "TIP",
  warning: "WARNING",
};

export async function migrateArticlesDirectory(
  directory: string,
  logger: MigrationLogger = console,
): Promise<MigrationSummary> {
  const absoluteDirectory = path.resolve(directory);
  const files = await collectArticleSourceFiles(absoluteDirectory);
  const assetIndex = await buildAssetIndex(absoluteDirectory);
  const results: MigrationFileResult[] = [];

  let markdownFiles = 0;
  let htmlFiles = 0;
  let writtenFiles = 0;
  let deletedHtmlFiles = 0;
  let warnings = 0;

  for (const absolutePath of files) {
    const extension = path.extname(absolutePath).toLowerCase();
    const source = await readFile(absolutePath, "utf8");
    const context: MigrateContext = {
      absolutePath,
      assetIndex,
      warnings: [],
    };

    let outputPath = absolutePath;
    let migrated = source;
    let deletedHtmlSource = false;

    if (extension === ".html") {
      htmlFiles += 1;
      outputPath = absolutePath.slice(0, -".html".length) + ".md";
      migrated = migrateHtmlArticle(source, context);
      deletedHtmlSource = outputPath !== absolutePath;
    } else {
      markdownFiles += 1;
      migrated = migrateMarkdownArticle(source, context);
    }

    const changed = migrated !== source || outputPath !== absolutePath;
    if (changed) {
      await writeFile(outputPath, migrated);
      writtenFiles += 1;
    }

    if (deletedHtmlSource) {
      await rm(absolutePath, { force: true });
      deletedHtmlFiles += 1;
    }

    warnings += context.warnings.length;
    for (const warning of context.warnings) {
      logger.warn?.(`${path.relative(absoluteDirectory, absolutePath)}: ${warning}`);
    }

    results.push({
      sourcePath: absolutePath,
      outputPath,
      changed,
      deletedHtmlSource,
      warnings: context.warnings,
    });
  }

  logger.info(
    `Migrated ${markdownFiles} markdown file(s) and ${htmlFiles} html file(s). Wrote ${writtenFiles} file(s).`,
  );

  return {
    markdownFiles,
    htmlFiles,
    writtenFiles,
    deletedHtmlFiles,
    warnings,
    results,
  };
}

export function migrateMarkdownArticle(
  source: string,
  context: Partial<MigrateContext> = {},
) {
  const normalizedContext = normalizeContext(context);
  const { frontmatter, body } = splitMarkdownFrontmatter(source);
  const migratedBody = migrateMarkdownBody(body, normalizedContext);
  return `${frontmatter}${migratedBody}`;
}

export function migrateHtmlArticle(
  source: string,
  context: Partial<MigrateContext> = {},
) {
  const normalizedContext = normalizeContext(context);
  const { frontmatter, body } = splitHtmlCommentFrontmatter(source);
  const markdownBody = convertHtmlBodyToMarkdown(body, normalizedContext);
  const migratedBody = migrateMarkdownBody(markdownBody, normalizedContext);
  return `${frontmatter}${migratedBody}`;
}

function normalizeContext(context: Partial<MigrateContext>): MigrateContext {
  return {
    absolutePath: context.absolutePath,
    assetIndex: context.assetIndex,
    warnings: context.warnings ?? [],
  };
}

async function collectArticleSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectArticleSourceFiles(absolutePath)));
      continue;
    }

    if (markdownExtensions.has(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files.sort();
}

async function buildAssetIndex(directory: string): Promise<AssetIndex> {
  const files = await collectAllFiles(directory);
  const bySuffix = new Map<string, string[]>();

  for (const absolutePath of files) {
    const relative = path
      .relative(directory, absolutePath)
      .split(path.sep)
      .join("/");

    if (relative.endsWith(".md") || relative.endsWith(".html")) {
      continue;
    }

    const parts = relative.split("/");
    for (let index = 0; index < parts.length; index += 1) {
      const suffix = `/${parts.slice(index).join("/")}`;
      const matches = bySuffix.get(suffix) ?? [];
      matches.push(`/${relative}`);
      bySuffix.set(suffix, matches);
    }
  }

  return {
    bySuffix,
    articleRoot: directory,
  };
}

async function collectAllFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectAllFiles(absolutePath)));
    } else {
      files.push(absolutePath);
    }
  }

  return files;
}

function splitMarkdownFrontmatter(source: string): SplitFrontmatterResult {
  const normalized = source.replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n[\s\S]*?\n---\n*/);
  if (!match) {
    return {
      frontmatter: "",
      body: normalized,
    };
  }

  return {
    frontmatter: match[0],
    body: normalized.slice(match[0].length),
  };
}

function splitHtmlCommentFrontmatter(source: string): SplitFrontmatterResult {
  const normalized = source.replace(/\r\n?/g, "\n");
  const match = normalized.match(/^<!--\n([\s\S]*?)\n-->\n*/);
  if (!match) {
    return {
      frontmatter: "",
      body: normalized,
    };
  }

  const yaml = match[1].trimEnd();
  return {
    frontmatter: `---\n${yaml}\n---\n\n`,
    body: normalized.slice(match[0].length),
  };
}

function migrateMarkdownBody(body: string, context: MigrateContext): string {
  let migrated = body.replace(/\r\n?/g, "\n");

  migrated = convertLegacyTabsets(migrated, context);
  migrated = convertWikiJsAlerts(migrated);
  migrated = convertHtmlBodyToMarkdown(migrated, context);
  migrated = convertInlineFootnotes(migrated);
  migrated = convertLegacyImageSizes(migrated);
  migrated = removeLegacyClassDirectives(migrated);
  migrated = fixMarkdownAssetPaths(migrated, context);
  migrated = cleanupMarkdownWhitespace(migrated);

  if (/<[A-Za-z][^>]*>/.test(migrated)) {
    context.warnings.push("Residual HTML detected after migration.");
  }

  return migrated;
}

function convertLegacyTabsets(source: string, context: MigrateContext): string {
  let current = source;

  while (true) {
    const migrated = convertFirstLegacyTabset(current, context);
    if (!migrated.changed) {
      return current;
    }
    current = migrated.value;
  }
}

function convertFirstLegacyTabset(
  source: string,
  context: MigrateContext,
): { changed: boolean; value: string } {
  const lines = source.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(#{2,6})\s+Tabset\s+\{\.tabset\}\s*$/);
    if (!match) {
      continue;
    }

    const parentDepth = match[1].length;
    const childDepth = parentDepth + 1;
    const childHeadingPrefix = `${"#".repeat(childDepth)} `;
    const tabs: Array<{ title: string; content: string[] }> = [];
    let cursor = index + 1;

    while (cursor < lines.length && lines[cursor].trim() === "") {
      cursor += 1;
    }

    while (cursor < lines.length) {
      const currentLine = lines[cursor];
      if (currentLine.startsWith(childHeadingPrefix)) {
        const title = currentLine.slice(childHeadingPrefix.length).trim();
        cursor += 1;
        const content: string[] = [];

        while (cursor < lines.length) {
          const nestedHeadingMatch = lines[cursor].match(/^(#+)\s+/);
          if (
            nestedHeadingMatch &&
            nestedHeadingMatch[1].length <= parentDepth
          ) {
            break;
          }

          if (lines[cursor].startsWith(childHeadingPrefix)) {
            break;
          }

          content.push(lines[cursor]);
          cursor += 1;
        }

        tabs.push({
          title,
          content: trimBlankLines(content),
        });
        continue;
      }

      const higherHeading = currentLine.match(/^(#+)\s+/);
      if (higherHeading && higherHeading[1].length <= parentDepth) {
        break;
      }

      cursor += 1;
    }

    if (tabs.length === 0) {
      context.warnings.push(`Failed to parse Tabset near line ${index + 1}.`);
      return {
        changed: false,
        value: source,
      };
    }

    const tabTitles = tabs.map((tab) => `"${escapeTabTitle(tab.title)}"`).join(", ");
    const tabBlocks = tabs
      .map((tab) => {
        const content = tab.content.join("\n").trimEnd();
        return `---\n${content}`;
      })
      .join("\n\n");

    const replacement = [`::tabs`, `tabs: [${tabTitles}]`, "", tabBlocks, `::`].join("\n");
    const updatedLines = [
      ...lines.slice(0, index),
      replacement,
      ...lines.slice(cursor),
    ];

    return {
      changed: true,
      value: updatedLines.join("\n"),
    };
  }

  return {
    changed: false,
    value: source,
  };
}

function escapeTabTitle(title: string) {
  return title.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function trimBlankLines(lines: string[]) {
  const copy = [...lines];
  while (copy[0]?.trim() === "") {
    copy.shift();
  }
  while (copy[copy.length - 1]?.trim() === "") {
    copy.pop();
  }
  return copy;
}

function convertWikiJsAlerts(source: string) {
  const lines = source.split("\n");
  const output: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith(">")) {
      const blockquoteLines: string[] = [];

      let cursor = index;
      while (cursor < lines.length && lines[cursor].trim().startsWith(">")) {
        blockquoteLines.push(lines[cursor]);
        cursor += 1;
      }

      const trailingMarkerMatch = blockquoteLines[blockquoteLines.length - 1]?.match(
        /^\s*>\s*\{\.is-(info|success|warning|danger)\}\s*$/,
      );
      const markerMatch = trailingMarkerMatch ?? lines[cursor]?.match(
        /^\s*>?\s*\{\.is-(info|success|warning|danger)\}\s*$/,
      );
      if (markerMatch) {
        const alertType = alertTypeMap[markerMatch[1]];
        const contentLines = trailingMarkerMatch
          ? blockquoteLines.slice(0, -1)
          : blockquoteLines;
        output.push(`> [!${alertType}]`);
        output.push(
          ...contentLines.map((value) => {
            const normalized = value.replace(/^\s*>\s?/, "");
            return normalized ? `> ${normalized}` : ">";
          }),
        );

        index = trailingMarkerMatch ? cursor - 1 : cursor;
        continue;
      }
    }

    output.push(line);
  }

  return output.join("\n");
}

function convertInlineFootnotes(source: string) {
  let footnoteIndex = 1;
  const definitions: string[] = [];
  let cursor = 0;
  let result = "";

  while (cursor < source.length) {
    if (source[cursor] === "^" && source[cursor + 1] === "[") {
      const end = findInlineFootnoteEnd(source, cursor + 2);
      if (end !== -1) {
        const content = source.slice(cursor + 2, end);
        const id = `legacy-note-${footnoteIndex}`;
        footnoteIndex += 1;
        result += `[^${id}]`;
        definitions.push(`[^${id}]: ${collapseWhitespace(content)}`);
        cursor = end + 1;
        continue;
      }
    }

    result += source[cursor];
    cursor += 1;
  }

  if (definitions.length === 0) {
    return source;
  }

  return `${result.trimEnd()}\n\n${definitions.join("\n")}\n`;
}

function findInlineFootnoteEnd(source: string, start: number) {
  let depth = 1;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "[") {
      depth += 1;
    } else if (char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function convertLegacyImageSizes(source: string) {
  return source.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\s*=\s*([0-9]*)x([0-9]*)\)/g,
    (_match, alt: string, rawPath: string, width: string, height: string) => {
      const dimensions: string[] = [];
      if (width) {
        dimensions.push(`width=${width}`);
      }
      if (height) {
        dimensions.push(`height=${height}`);
      }

      if (dimensions.length === 0) {
        return `![${alt}](${rawPath})`;
      }

      return `![${alt}](${rawPath} "${dimensions.join(" ")}")`;
    },
  );
}

function removeLegacyClassDirectives(source: string) {
  return source
    .replace(/^\s*\{\.links-list\}\s*$/gm, "")
    .replace(/^\s*\{\.text-big\}\s*$/gm, "");
}

function fixMarkdownAssetPaths(source: string, context: MigrateContext) {
  if (!context.assetIndex) {
    return source;
  }

  return source.replace(
    /(!\[[^\]]*\]\()([^) "\n]+)([^)]*\))/g,
    (match, prefix: string, rawPath: string, suffix: string) => {
      const fixedPath = resolveAssetPath(rawPath, context);
      return fixedPath === rawPath ? match : `${prefix}${fixedPath}${suffix}`;
    },
  );
}

function resolveAssetPath(rawPath: string, context: MigrateContext) {
  if (!context.assetIndex) {
    return rawPath;
  }

  if (!rawPath.startsWith("/") || rawPath.startsWith("//")) {
    return rawPath;
  }

  const existingPath = path.join(context.assetIndex.articleRoot, rawPath.slice(1));
  const absolutePath = context.absolutePath;
  if (absolutePath && path.dirname(absolutePath) === absolutePath) {
    return rawPath;
  }

  const candidates = context.assetIndex.bySuffix.get(rawPath) ?? [];
  if (candidates.length === 1) {
    return candidates[0];
  }

  if (candidates.length > 1) {
    context.warnings.push(`Ambiguous asset path "${rawPath}" could not be auto-fixed.`);
  }

  return rawPath;
}

function cleanupMarkdownWhitespace(source: string) {
  return `${source
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function convertHtmlBodyToMarkdown(source: string, context: MigrateContext) {
  let current = source.replace(/\r\n?/g, "\n");
  current = current.replace(/&nbsp;/g, " ");
  current = current.replace(/<style[\s\S]*?<\/style>/gi, "");
  current = replacePageRowBlocks(current, context);

  const replacements: Array<{
    pattern: RegExp;
    convert: (match: string) => string;
  }> = [
    {
      pattern: /<blockquote[^>]*class="[^"]*is-info[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi,
      convert: (match) => convertHtmlBlockquote(match),
    },
    {
      pattern: /<figure[^>]*class="[^"]*table[^"]*"[^>]*>[\s\S]*?<\/figure>/gi,
      convert: (match) => convertHtmlTableFigure(match, context),
    },
    {
      pattern: /<table[\s\S]*?<\/table>/gi,
      convert: (match) => convertStandaloneHtmlTable(match, context),
    },
    {
      pattern: /<figure[^>]*class="[^"]*image[^"]*"[^>]*>[\s\S]*?<\/figure>/gi,
      convert: (match) => convertHtmlImageFigure(match),
    },
    {
      pattern: /<ol[\s\S]*?<\/ol>/gi,
      convert: (match) => convertHtmlList(match, true),
    },
    {
      pattern: /<ul[\s\S]*?<\/ul>/gi,
      convert: (match) => convertHtmlList(match, false),
    },
    {
      pattern: /<center>([\s\S]*?)<\/center>/gi,
      convert: (match) => convertCenterBlock(match),
    },
    {
      pattern: /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      convert: (_match) => convertHtmlHeading(_match),
    },
    {
      pattern: /<p[^>]*>([\s\S]*?)<\/p>/gi,
      convert: (_match) => convertHtmlParagraph(_match),
    },
  ];

  for (const { pattern, convert } of replacements) {
    current = current.replace(pattern, (match) => `${convert(match)}\n\n`);
  }

  current = current.replace(/<img([^>]*?)>/gi, (_match, attributes: string) => {
    const src = readHtmlAttribute(attributes, "src");
    if (!src) {
      return "";
    }
    const alt = readHtmlAttribute(attributes, "alt") ?? "";
    return `![${decodeHtmlEntities(stripHtmlTags(alt))}](${src})`;
  });

  current = current.replace(/<br\s*\/?>/gi, "\n");
  current = current.replace(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/gi, (_match, src: string) => {
    const href = src.startsWith("//") ? `https:${src}` : src;
    return `[嵌入视频](${href})`;
  });
  current = current.replace(/<kbd[^>]*>([\s\S]*?)<\/kbd>/gi, (_match, text: string) => {
    return `\`${collapseWhitespace(stripHtmlTags(text))}\``;
  });
  current = current.replace(/<\/?font[^>]*>/gi, "");
  current = current.replace(/<\/?center>/gi, "");
  current = current.replace(/<\/?div[^>]*>/gi, "\n");
  current = current.replace(/<\/?span[^>]*>/gi, "");

  return decodeHtmlEntities(current);
}

function convertHtmlBlockquote(source: string) {
  const inner = stripOuterTag(source, "blockquote");
  const contentLines = convertHtmlBodyToMarkdown(inner, normalizeContext({ warnings: [] }))
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");

  return [`> [!TIP]`, ...contentLines.map((line) => `> ${line}`)].join("\n");
}

function convertHtmlImageFigure(source: string) {
  const imgMatch = source.match(/<img([^>]*?)>/i);
  if (!imgMatch) {
    return "";
  }

  const src = readHtmlAttribute(imgMatch[1], "src");
  if (!src) {
    return "";
  }

  const alt = decodeHtmlEntities(stripHtmlTags(readHtmlAttribute(imgMatch[1], "alt") ?? ""));
  const figcaptionMatch = source.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
  const caption = figcaptionMatch
    ? collapseWhitespace(convertInlineHtml(figcaptionMatch[1]))
    : "";

  return [caption ? `![${alt || caption}](${src})` : `![${alt}](${src})`, caption].filter(Boolean).join("\n");
}

function convertHtmlCardRow(source: string, context: MigrateContext) {
  const cards = [...source.matchAll(/<div[^>]*class="[^"]*card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi)];
  if (cards.length === 0) {
    const inner = stripOuterTag(source, "div");
    return convertHtmlBodyToMarkdown(inner, normalizeContext({ warnings: context.warnings })).trim();
  }

  const names = cards
    .map((card) => {
      const text = decodeHtmlEntities(stripHtmlTags(card[1]));
      const lines = text
        .split("\n")
        .map((line) => collapseWhitespace(line))
        .filter(Boolean);
      return lines[lines.length - 1] ?? "";
    })
    .filter(Boolean);

  return names.map((name) => `- ${name}`).join("\n");
}

function convertHtmlList(source: string, ordered: boolean) {
  const items = [...source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
  return items
    .map((item, index) => {
      const body = cleanupMarkdownWhitespace(
        convertHtmlBodyToMarkdown(item[1], normalizeContext({ warnings: [] })),
      ).trim();
      const lines = body.split("\n");
      return lines
        .map((line, lineIndex) => {
          if (lineIndex === 0) {
            return ordered ? `${index + 1}. ${line}` : `- ${line}`;
          }
          return `   ${line}`;
        })
        .join("\n");
    })
    .join("\n");
}

function convertCenterBlock(source: string) {
  const content = stripOuterTag(source, "center").trim();
  if (!content) {
    return "";
  }

  if (/<img/i.test(content)) {
    return convertHtmlBodyToMarkdown(content, normalizeContext({ warnings: [] })).trim();
  }

  return collapseWhitespace(convertInlineHtml(content));
}

function convertHtmlHeading(source: string) {
  const match = source.match(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/i);
  if (!match) {
    return "";
  }

  const level = Number(match[1]);
  const text = collapseWhitespace(convertInlineHtml(match[2]));
  return `${"#".repeat(level)} ${text}`;
}

function convertHtmlParagraph(source: string) {
  const match = source.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  if (!match) {
    return "";
  }

  const text = collapseWhitespace(convertInlineHtml(match[1]));
  return text;
}

function convertHtmlTableFigure(source: string, context: MigrateContext) {
  const tableMatch = source.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    context.warnings.push("Table figure did not contain a parsable table.");
    return "";
  }

  return convertHtmlTable(tableMatch[0], context);
}

function convertStandaloneHtmlTable(source: string, context: MigrateContext) {
  return convertHtmlTable(source, context);
}

function convertHtmlTable(source: string, context: MigrateContext) {
  const rows = [...source.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => {
    return [...rowMatch[1].matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi)].map((cellMatch) => {
      const attributes = cellMatch[2] ?? "";
      const colspan = Number(readHtmlAttribute(attributes, "colspan") ?? "1");
      const rowspan = Number(readHtmlAttribute(attributes, "rowspan") ?? "1");
      return {
        colspan: Number.isFinite(colspan) && colspan > 0 ? colspan : 1,
        rowspan: Number.isFinite(rowspan) && rowspan > 0 ? rowspan : 1,
        text: collapseWhitespace(convertInlineHtml(cellMatch[3])),
      } satisfies HtmlTableCell;
    });
  });

  if (rows.length === 0) {
    return "";
  }

  const hasRowspan = rows.some((row) => row.some((cell) => cell.rowspan > 1));
  const widths = rows.map((row) =>
    row.reduce((total, cell) => total + Math.max(cell.colspan, 1), 0),
  );
  const consistentWidth = widths.every((width) => width === widths[0]);
  const hasComplexShape = hasRowspan || !consistentWidth || widths[0] === 0;

  if (hasComplexShape) {
    context.warnings.push("Converted a complex HTML table into a bullet list fallback.");
    return rows
      .map((row) => {
        const values = expandColspanRow(row);
        return `- ${values.join(" | ")}`;
      })
      .join("\n");
  }

  const matrix = rows.map(expandColspanRow);
  const header = matrix[0].map((value, index) => value || `列${index + 1}`);
  const bodyRows = matrix.slice(1);

  if (bodyRows.length === 0) {
    return `| ${header.join(" | ")} |\n| ${header.map(() => "---").join(" | ")} |`;
  }

  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...bodyRows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function expandColspanRow(row: HtmlTableCell[]) {
  return row.flatMap((cell) => {
    const values = Array.from({ length: cell.colspan }, () => cell.text);
    return values.length > 0 ? values : [cell.text];
  });
}

function stripOuterTag(source: string, tagName: string) {
  return source
    .replace(new RegExp(`^<${tagName}[^>]*>`, "i"), "")
    .replace(new RegExp(`</${tagName}>$`, "i"), "");
}

function convertInlineHtml(source: string): string {
  return decodeHtmlEntities(
    source
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href: string, text: string) => {
        const label = collapseWhitespace(convertInlineHtml(text));
        return `[${label}](${href})`;
      })
      .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text: string) => {
        return `**${collapseWhitespace(convertInlineHtml(text))}**`;
      })
      .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_match, _tag, text: string) => {
        return `*${collapseWhitespace(convertInlineHtml(text))}*`;
      })
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_match, text: string) => {
        return `\`${collapseWhitespace(stripHtmlTags(text))}\``;
      })
      .replace(/<\/?span[^>]*>/gi, "")
      .replace(/<\/?div[^>]*>/gi, "\n")
      .replace(/<\/?font[^>]*>/gi, "")
      .replace(/<img([^>]*?)>/gi, (_match, attributes: string) => {
        const src = readHtmlAttribute(attributes, "src");
        if (!src) {
          return "";
        }
        const alt = readHtmlAttribute(attributes, "alt") ?? "";
        return `![${decodeHtmlEntities(stripHtmlTags(alt))}](${src})`;
      })
      .replace(/<\/?[^>]+>/g, ""),
  );
}

function stripHtmlTags(source: string) {
  return source.replace(/<[^>]+>/g, "");
}

function collapseWhitespace(source: string) {
  return decodeHtmlEntities(source)
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(source: string) {
  return source
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function readHtmlAttribute(source: string, attribute: string) {
  const match = source.match(new RegExp(`${attribute}="([^"]*)"`, "i"));
  return match?.[1];
}

function replacePageRowBlocks(source: string, context: MigrateContext) {
  let current = source;

  while (true) {
    const start = current.search(/<div[^>]*class="[^"]*page-row[^"]*"[^>]*>/i);
    if (start === -1) {
      return current;
    }

    const openTagEnd = current.indexOf(">", start);
    if (openTagEnd === -1) {
      return current;
    }

    let depth = 1;
    let cursor = openTagEnd + 1;

    while (cursor < current.length && depth > 0) {
      const nextOpen = current.slice(cursor).search(/<div\b/i);
      const nextClose = current.slice(cursor).search(/<\/div>/i);

      if (nextClose === -1) {
        context.warnings.push("Unclosed page-row block detected.");
        return current;
      }

      const absoluteClose = cursor + nextClose;
      const absoluteOpen = nextOpen === -1 ? -1 : cursor + nextOpen;

      if (absoluteOpen !== -1 && absoluteOpen < absoluteClose) {
        depth += 1;
        const nextOpenEnd = current.indexOf(">", absoluteOpen);
        if (nextOpenEnd === -1) {
          context.warnings.push("Malformed page-row div block detected.");
          return current;
        }
        cursor = nextOpenEnd + 1;
      } else {
        depth -= 1;
        cursor = absoluteClose + "</div>".length;
      }
    }

    const block = current.slice(start, cursor);
    const replacement = `${convertHtmlCardRow(block, context)}\n\n`;
    current = `${current.slice(0, start)}${replacement}${current.slice(cursor)}`;
  }
}
