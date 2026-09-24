import { prisma } from "@/lib/prisma";
import type { RagCandidate } from "@/lib/rag/vector";

interface RawLexicalRow {
  chunk_id: string | null;
  heading: string | null;
  content: string;
  article_path: string;
  article_title: string;
  article_updated_at: Date | null;
  score: number | null;
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, "\\$&");
}

function parseHeadingPath(heading: string | null): string[] {
  if (!heading) return [];
  return [heading];
}

export async function lexicalSearchChunks(
  query: string,
  limit: number,
): Promise<RagCandidate[]> {
  const pattern = `%${escapeLike(query)}%`;

  try {
    const rows = await prisma.$queryRaw<RawLexicalRow[]>`
      SELECT
        ac.id AS chunk_id,
        ac.heading AS heading,
        ac.content AS content,
        a.path AS article_path,
        a.title AS article_title,
        a.updated_at AS article_updated_at,
        GREATEST(
          similarity(ac.content, ${query}),
          similarity(a.title, ${query}) * 1.5
        ) AS score
      FROM agent_chunks ac
      JOIN articles a ON a.id = ac.article_id
      WHERE a.status = 'PUBLISHED'
        AND ac.content IS NOT NULL
        AND (
          ac.content ILIKE ${pattern}
          OR a.title ILIKE ${pattern}
          OR a.path ILIKE ${pattern}
        )
      ORDER BY score DESC, a.updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      article_path: row.article_path,
      article_title: row.article_title,
      heading_path: parseHeadingPath(row.heading),
      content: row.content,
      score: Number(row.score ?? 0),
      match_types: ["lexical"],
      updated_at: row.article_updated_at,
    }));
  } catch {
    // pg_trgm 不可用时的兜底关键词匹配
    const rows = await prisma.$queryRaw<RawLexicalRow[]>`
      SELECT
        ac.id AS chunk_id,
        ac.heading AS heading,
        ac.content AS content,
        a.path AS article_path,
        a.title AS article_title,
        a.updated_at AS article_updated_at,
        0.5 AS score
      FROM agent_chunks ac
      JOIN articles a ON a.id = ac.article_id
      WHERE a.status = 'PUBLISHED'
        AND ac.content IS NOT NULL
        AND (
          ac.content ILIKE ${pattern}
          OR a.title ILIKE ${pattern}
          OR a.path ILIKE ${pattern}
        )
      ORDER BY a.updated_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      chunk_id: row.chunk_id,
      article_path: row.article_path,
      article_title: row.article_title,
      heading_path: parseHeadingPath(row.heading),
      content: row.content,
      score: Number(row.score ?? 0),
      match_types: ["lexical"],
      updated_at: row.article_updated_at,
    }));
  }
}
