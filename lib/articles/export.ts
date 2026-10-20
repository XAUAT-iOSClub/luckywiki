import matter from "gray-matter";
import { ArticleStatus } from "@/generated/prisma/enums";

export type ExportableArticle = {
  path: string;
  title: string;
  description: string | null;
  tags: string[];
  editor: string | null;
  markdown: string;
  status: ArticleStatus;
  publishedAt: Date | null;
  createdAt: Date;
};

/**
 * Serializes an article into the same markdown + frontmatter shape the
 * importer understands, so an exported file can be imported again without
 * losing metadata. The title is written both as frontmatter and as a leading
 * H1: the importer reads frontmatter first, then strips that H1 from the body.
 */
export function serializeArticleMarkdown(article: ExportableArticle) {
  const frontmatter: Record<string, unknown> = {
    title: article.title,
    published: article.status === ArticleStatus.PUBLISHED,
    date: article.publishedAt ?? article.createdAt,
  };
  const description = article.description?.trim();

  if (description) {
    frontmatter.description = description;
  }

  if (article.tags.length > 0) {
    frontmatter.tags = article.tags;
  }

  const editor = article.editor?.trim();

  if (editor) {
    frontmatter.editor = editor;
  }

  const headingTitle = article.title.replace(/\s+/gu, " ").trim();
  const body = article.markdown.replace(/\r\n/gu, "\n").trim();
  const content = body
    ? `# ${headingTitle}\n\n${body}\n`
    : `# ${headingTitle}\n`;

  return matter.stringify(content, frontmatter);
}

/**
 * Derives a safe download name from the article path. The root article maps
 * to `index.md`, matching the importer's `index.md -> ""` convention.
 */
export function getArticleExportFileName(article: Pick<ExportableArticle, "path">) {
  const segment = article.path.split("/").filter(Boolean).at(-1) ?? "index";
  const sanitized = segment
    .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();

  return `${sanitized || "index"}.md`;
}

export function buildAttachmentContentDisposition(fileName: string) {
  const asciiFallback =
    fileName
      .replace(/[^\u0020-\u007E]/gu, "_")
      .replace(/["\\]/gu, "_") || "article.md";
  const encoded = encodeURIComponent(fileName).replace(/'/gu, "%27");

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}
