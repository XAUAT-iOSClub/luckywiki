import { ArticleStatus } from "@/generated/prisma/enums";
import { extractMarkdownPlainText } from "@/lib/text";

const defaultMaxCharacters = 900;

export type ChunkableArticle = {
  id: string;
  title: string;
  path: string;
  markdown: string;
  status: ArticleStatus;
};

export type ArticleChunk = {
  articleId: string;
  chunkIndex: number;
  heading: string | null;
  content: string;
};

export function buildArticleChunks(
  article: ChunkableArticle,
  maxCharacters = defaultMaxCharacters,
) {
  const sections = splitMarkdownIntoSections(article);
  const chunks: ArticleChunk[] = [];

  for (const section of sections) {
    const paragraphs = section.content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      continue;
    }

    let current = "";

    for (const paragraph of paragraphs) {
      if (!current) {
        current = paragraph;
        continue;
      }

      const nextValue = `${current}\n\n${paragraph}`;

      if (nextValue.length <= maxCharacters) {
        current = nextValue;
        continue;
      }

      pushChunk(chunks, article.id, section.heading, current, maxCharacters);
      current = paragraph;
    }

    if (current) {
      pushChunk(chunks, article.id, section.heading, current, maxCharacters);
    }
  }

  if (chunks.length === 0) {
    const fallback = extractMarkdownPlainText(article.markdown).replace(/\s+/g, " ").trim();
    if (fallback) {
      pushChunk(chunks, article.id, article.title, fallback, maxCharacters);
    }
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    chunkIndex: index,
  }));
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index]! * right[index]!;
    leftMagnitude += left[index]! * left[index]!;
    rightMagnitude += right[index]! * right[index]!;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function rankChunksBySimilarity<T extends { embedding: number[] }>(
  chunks: T[],
  queryEmbedding: number[],
) {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(chunk.embedding, queryEmbedding),
    }))
    .sort((left, right) => right.score - left.score);
}

function splitMarkdownIntoSections(article: ChunkableArticle) {
  const lines = article.markdown.replace(/\r\n/g, "\n").split("\n");
  const sections: Array<{ heading: string | null; content: string }> = [];
  let currentHeading: string | null = article.title;
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+?)\s*$/);

    if (headingMatch) {
      appendSection(sections, currentHeading, currentLines);
      currentHeading = headingMatch[1] ?? article.title;
      currentLines = [];
      continue;
    }

    currentLines.push(line);
  }

  appendSection(sections, currentHeading, currentLines);
  return sections;
}

function appendSection(
  sections: Array<{ heading: string | null; content: string }>,
  heading: string | null,
  lines: string[],
) {
  const content = extractMarkdownPlainText(lines.join("\n"));

  if (!content) {
    return;
  }

  sections.push({
    heading: heading?.trim() || null,
    content,
  });
}

function pushChunk(
  chunks: ArticleChunk[],
  articleId: string,
  heading: string | null,
  content: string,
  maxCharacters: number,
) {
  const normalized = content.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return;
  }

  if (normalized.length <= maxCharacters) {
    chunks.push({
      articleId,
      chunkIndex: chunks.length,
      heading,
      content: normalized,
    });
    return;
  }

  for (const segment of splitLongText(normalized, maxCharacters)) {
    chunks.push({
      articleId,
      chunkIndex: chunks.length,
      heading,
      content: segment,
    });
  }
}

function splitLongText(text: string, maxCharacters: number) {
  const sentences = text.split(/(?<=[。！？.!?])\s+/u).filter(Boolean);

  if (sentences.length <= 1) {
    return splitByLength(text, maxCharacters);
  }

  const segments: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const nextValue = current ? `${current} ${sentence}` : sentence;

    if (nextValue.length <= maxCharacters) {
      current = nextValue;
      continue;
    }

    if (current) {
      segments.push(current);
    }

    current = sentence;
  }

  if (current) {
    segments.push(current);
  }

  return segments.flatMap((segment) => splitByLength(segment, maxCharacters));
}

function splitByLength(text: string, maxCharacters: number) {
  const segments: string[] = [];

  for (let index = 0; index < text.length; index += maxCharacters) {
    segments.push(text.slice(index, index + maxCharacters).trim());
  }

  return segments.filter(Boolean);
}
