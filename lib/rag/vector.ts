import { prisma } from "@/lib/prisma";
import { getQueryEmbedding } from "@/lib/rag/embedding";

export interface RagCandidate {
  chunk_id: string | null;
  article_path: string;
  article_title: string;
  heading_path: string[];
  content: string;
  score: number;
  match_types: Array<"lexical" | "vector">;
  updated_at: Date | null;
}

interface RawVectorRow {
  chunk_id: string;
  heading: string | null;
  content: string;
  article_path: string;
  article_title: string;
  article_updated_at: Date | null;
  score: number | null;
}

function parseHeadingPath(heading: string | null): string[] {
  if (!heading) return [];
  return [heading];
}

export async function vectorSearchChunks(
  query: string,
  limit: number,
): Promise<RagCandidate[]> {
  const embedding = await getQueryEmbedding(query);

  if (!embedding) {
    return [];
  }

  const vectorText = `[${embedding.join(",")}]`;

  const rows = await prisma.$queryRaw<RawVectorRow[]>`
    SELECT
      ac.id AS chunk_id,
      ac.heading AS heading,
      ac.content AS content,
      a.path AS article_path,
      a.title AS article_title,
      a.updated_at AS article_updated_at,
      1 - (ac.embedding_vector <=> ${vectorText}::vector) AS score
    FROM agent_chunks ac
    JOIN articles a ON a.id = ac.article_id
    WHERE a.status = 'PUBLISHED'
      AND ac.embedding_vector IS NOT NULL
      AND ac.content IS NOT NULL
      AND length(trim(ac.content)) > 0
    ORDER BY ac.embedding_vector <=> ${vectorText}::vector
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    chunk_id: row.chunk_id,
    article_path: row.article_path,
    article_title: row.article_title,
    heading_path: parseHeadingPath(row.heading),
    content: row.content,
    score: Number(row.score ?? 0),
    match_types: ["vector"],
    updated_at: row.article_updated_at,
  }));
}
