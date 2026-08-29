import { ArticleStatus } from "@/generated/prisma/enums";
import { rankChunksBySimilarity } from "@/lib/agent/chunks";
import { embedTexts } from "@/lib/agent/openai";
import { prisma } from "@/lib/prisma";
import type { RetrievedAgentChunk } from "@/types/agent";
import { cache } from "react";

const minimumRelevantScore = 0.35;

export async function retrieveRelevantAgentChunks(query: string) {
  let queryEmbedding: number[] | undefined;

  try {
    [queryEmbedding] = await embedTexts([query]);
  } catch (error) {
    // BM25 remains useful when an embedding gateway/model is unavailable.
    const lexical = await retrieveLexicalOnly(query);
    if (lexical) {
      return limitRetrievedChunks(lexical, true);
    }
    throw error;
  }

  if (!queryEmbedding) {
    return [];
  }

  const sqlResults = await retrieveWithParadeDb(query, queryEmbedding);

  if (sqlResults) {
    const hasRelevantSemantic = sqlResults.some(
      (chunk) => chunk.score >= minimumRelevantScore,
    );
    return limitRetrievedChunks(sqlResults, !hasRelevantSemantic);
  }

  const chunks = await prisma.agentChunk.findMany({
    include: {
      article: {
        select: {
          path: true,
          title: true,
          status: true,
        },
      },
    },
    where: {
      article: {
        status: ArticleStatus.PUBLISHED,
      },
    },
  });

  const ranked = rankChunksBySimilarity(
    chunks.map((chunk) => ({
      path: chunk.article.path,
      title: chunk.article.title,
      heading: chunk.heading,
      content: chunk.content,
      embedding: safeParseEmbedding(chunk.embedding),
    })),
    queryEmbedding,
  );

  return limitRetrievedChunks(
    ranked.map((chunk) => ({
      path: chunk.path,
      title: chunk.title,
      heading: chunk.heading,
      content: chunk.content,
      score: chunk.score,
    })),
  );
}

async function retrieveLexicalOnly(query: string): Promise<RetrievedAgentChunk[] | null> {
  if (!(await isPgSearchAvailable())) {
    return null;
  }

  try {
    const matches = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c.id
      FROM agent_chunks c
      JOIN articles a ON a.id = c.article_id
      WHERE a.status = 'PUBLISHED'
        AND (c.content @@@ ${query} OR c.heading @@@ ${query})
      ORDER BY paradedb.score(c.id) DESC
      LIMIT 24
    `;
    if (matches.length === 0) return [];

    const rows = await prisma.agentChunk.findMany({
      where: { id: { in: matches.map((match) => match.id) } },
      include: { article: { select: { path: true, title: true, status: true } } },
    });
    const rank = new Map(matches.map((match, index) => [match.id, index + 1]));
    return rows
      .map((row) => ({
        path: row.article.path,
        title: row.article.title,
        heading: row.heading,
        content: row.content,
        score: 0.25 / (rank.get(row.id) ?? matches.length),
      }))
      .sort((left, right) => right.score - left.score);
  } catch (error) {
    console.warn("[agent] lexical fallback unavailable", error);
    return null;
  }
}

type SqlChunk = RetrievedAgentChunk & { id: string; semanticScore: number; lexicalRank: number | null };

/** Run ANN and BM25 in the database, then fuse both ranked lists. */
async function retrieveWithParadeDb(
  query: string,
  queryEmbedding: number[],
): Promise<RetrievedAgentChunk[] | null> {
  if (!(await isPgVectorAvailable())) {
    return null;
  }

  try {
    const vector = JSON.stringify(queryEmbedding);
    const semantic = await prisma.$queryRaw<Array<{
      id: string;
      path: string;
      title: string;
      heading: string | null;
      content: string;
      score: number;
    }>>`
      SELECT c.id, a.path, a.title, c.heading, c.content,
        1 - (c.embedding_vector <=> ${vector}::vector) AS score
      FROM agent_chunks c
      JOIN articles a ON a.id = c.article_id
      WHERE a.status = 'PUBLISHED' AND c.embedding_vector IS NOT NULL
      ORDER BY c.embedding_vector <=> ${vector}::vector
      LIMIT 24
    `;

    let lexical: Array<{ id: string; score: number }> = [];
    if (await isPgSearchAvailable()) {
      try {
        lexical = await prisma.$queryRaw<Array<{ id: string; score: number }>>`
          SELECT c.id, paradedb.score(c.id) AS score
          FROM agent_chunks c
          JOIN articles a ON a.id = c.article_id
          WHERE a.status = 'PUBLISHED'
            AND (c.content @@@ ${query} OR c.heading @@@ ${query})
          ORDER BY score DESC
          LIMIT 24
        `;
      } catch (error) {
        console.warn("[agent] ParadeDB lexical query unavailable", error);
      }
    }

    const lexicalRanks = new Map(lexical.map((row, index) => [row.id, index + 1]));
    const fused: SqlChunk[] = semantic.map((row) => {
      const rank = lexicalRanks.get(row.id) ?? null;
      const lexicalBoost = rank ? 1 / rank : 0;
      return {
        id: row.id,
        path: row.path,
        title: row.title,
        heading: row.heading,
        content: row.content,
        semanticScore: Number(row.score),
        lexicalRank: rank,
        score: Math.min(1, Number(row.score) * 0.75 + lexicalBoost * 0.25),
      };
    });

    // Lexical-only hits still help when the embedding model misses an exact
    // term. Fetch their content and give them a conservative score.
    const semanticIds = new Set(semantic.map((row) => row.id));
    const lexicalOnlyIds = lexical.filter((row) => !semanticIds.has(row.id)).map((row) => row.id);
    if (lexicalOnlyIds.length > 0) {
      const rows = await prisma.agentChunk.findMany({
        where: { id: { in: lexicalOnlyIds } },
        include: { article: { select: { path: true, title: true, status: true } } },
      });
      for (const row of rows) {
        const rank = lexicalRanks.get(row.id) ?? lexicalOnlyIds.length;
        fused.push({
          id: row.id,
          path: row.article.path,
          title: row.article.title,
          heading: row.heading,
          content: row.content,
          semanticScore: 0,
          lexicalRank: rank,
          score: Math.min(1, 0.25 / rank),
        });
      }
    }

    return fused.sort((left, right) => right.score - left.score);
  } catch (error) {
    console.warn("[agent] pgvector query unavailable", error);
    return null;
  }
}

function limitRetrievedChunks(chunks: RetrievedAgentChunk[], allowLowScores = false) {
  const perArticleLimit = new Map<string, number>();
  const results: RetrievedAgentChunk[] = [];
  for (const chunk of chunks) {
    if (!allowLowScores && chunk.score < minimumRelevantScore) continue;
    const currentCount = perArticleLimit.get(chunk.path) ?? 0;
    if (currentCount >= 2) continue;
    perArticleLimit.set(chunk.path, currentCount + 1);
    results.push(chunk);
    if (results.length >= 6) break;
  }
  return results;
}

export async function findSuggestedAgentSources(query: string) {
  const normalized = query.trim();

  if (!normalized) {
    return [];
  }

  const suggestions = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      OR: [
        {
          title: {
            contains: normalized,
            mode: "insensitive",
          },
        },
        {
          path: {
            contains: normalized,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      path: true,
      title: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 3,
  });

  return suggestions;
}

function safeParseEmbedding(embedding: string) {
  try {
    const value = JSON.parse(embedding) as number[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

const isPgVectorAvailable = cache(async (): Promise<boolean> => {
  try {
    const result = await prisma.$queryRaw<Array<{ available: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
        AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'agent_chunks' AND column_name = 'embedding_vector'
        ) AS "available"
    `;
    return result[0]?.available ?? false;
  } catch {
    return false;
  }
});

const isPgSearchAvailable = cache(async (): Promise<boolean> => {
  try {
    const result = await prisma.$queryRaw<Array<{ available: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_search') AS "available"
    `;
    return result[0]?.available ?? false;
  } catch {
    return false;
  }
});
